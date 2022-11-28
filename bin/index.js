#! /usr/bin/env node

const { Client } = require("pg");
require("dotenv").config();
const { exec } = require("child_process");

const fs = require("fs");

const user = process.env.DB_USER || null;
const host = process.env.DB_HOST || null;
const database = process.env.DATABASE || null;
const password = process.env.PASSWORD || null;
const port = process.env.PORT || 5432;

const client = new Client({
  user,
  host,
  database,
  password,
  port,
});

const dirs = new Array();

const salt = "_" + 97 + Math.floor(Math.random() * 26);

fs.readdir(".", async (err, files) => {
  if (err) throw err;
  files.forEach((file) => {
    if (
      file.slice(0, 4) == "SQL_" &&
      file.substring(file.length - 4) == ".zip"
    ) {
      const newDirName = file.substring(0, file.length - 4) + salt;
      dirs.push(newDirName);
      fs.mkdirSync(newDirName);
      fs.copyFileSync(file, newDirName + "/" + file);
      const cwd = { cwd: process.cwd() + "/" + newDirName };
      exec(`unzip ${file}`, cwd, (error, stdout, stderr) => {
        if (error) {
          console.log(`error: ${error.message}`);
          return;
        }
      }).exitCode = 1;
    }
  });
  // Ideally these things would be better placed outside the readdir callback, but that
  // would cause issue with the promises of the queries
  client.connect();
  const queryPromises = new Array();
  for (let i = 1; i <= 10; i++) {
    let queries = new Array();
    dirs.forEach((dirName) => {
      const path = `./${dirName}/query_${i}.sql`;
      console.log("Now reading: ", path);

      let query = fs
        .readFileSync(path, {
          encoding: "utf-8",
        })
        .trim();
      queries.push({
        body: query,
        author: dirName.substring(4, 10),
      });
    });
    for (let t = 0; t < queries.length; t++) {
      for (let k = 0; k < queries.length; k++) {
        if (k == t) continue;
        queryPromises.push(
          client
            .query(produceQuery(queries[t].body, queries[k].body))
            .then((res) => {
              console.log(
                `Query ${i}: successfully parsed, (${queries[t].author} against ${queries[k].author}) `
              );
              if (res.rowCount > 0) {
                const color =
                  ";background: white; color: red; padding: 3px; border-radius: 5px;";
                console.log(
                  `%cQuery ${i}: detected differences between ${queries[t].author} and ${queries[k].author}, logging...`,
                  color
                );
                const out = res.rows.reduce(
                  (prev, current) => prev + `\n${JSON.stringify(current)}`,
                  new String()
                );
                fs.writeFileSync(
                  `./query_${i}-${queries[t].author}-${queries[k].author}.txt`,
                  out
                );
              } else {
                console.log(`No differences to report! \n\n`);
              }
            })
            .catch(() => {
              console.log(
                `error while trying to parse query ${1}, specifically ${
                  queries[t].author
                } against ${
                  queries[k].author
                }\n Now I'll try to look into the specific queries, wish me luck`
              );
              queryPromises.push(
                client
                  .query(queries[t].body)
                  .then(() =>
                    console.log(`${queries[t].author}'s query works!`)
                  )
                  .catch((err) => {
                    console.log(`${queries[t].author}'s query is faulty!`, err);
                  })
              );
              queryPromises.push(
                client
                  .query(queries[k].body)
                  .then(() =>
                    console.log(`${queries[k].author}'s query works!`)
                  )
                  .catch((err) => {
                    console.log(`${queries[k].author}'s query is faulty!`, err);
                  })
              );
            })
        );
      }
    }
  }
  dirs.forEach((dir) => {
    fs.rm(dir, { force: true, recursive: true }, (err) => {
      if (err)
        console.log(
          "We had an error while trying to delete the folder: " + err
        );
    });
  });

  Promise.all(queryPromises).finally(() => {
    setTimeout(() => {
      client.end();
    }, 1000);
  });
});

function produceQuery(body1, body2) {
  return `(${body1.substring(
    0,
    body1.length - 1
  )})\n EXCEPT\n (${body2.substring(0, body2.length - 1)});`;
}
