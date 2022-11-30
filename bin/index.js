#! /usr/bin/env node

function cleanDirs() {
  dirs.forEach((dir) => {
    fs.rm(dir, { force: true, recursive: true }, (err) => {
      if (err)
        console.log(
          "We had an error while trying to delete the folder: " + err
        );
    });
  });
}

process.on("SIGINT", cleanDirs);

const { Client } = require("pg");
require("dotenv").config();
const util = require("util");
const exec = util.promisify(require("child_process").exec);

const fs = require("fs");

const user = process.env.DB_USER || null;
const host = process.env.DB_HOST || "localhost";
const database = process.env.DATABASE || null;
const password = process.env.PASSWORD || null;
const port = process.env.PORT || 5432;

try {
  const client = new Client({
    user,
    host,
    database,
    password,
    port,
  });

  const dirs = new Array();

  const salt = "_" + 97 + Math.floor(Math.random() * 26);

  const files = fs.readdirSync(".");

  const unzipPromises = new Array();

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
      unzipPromises.push(exec(`unzip ${file}`, cwd));
    }
  });

  // Ideally these things would be better placed outside the readdir callback, but that
  // would cause issue with the promises of the queries
  client.connect();

  Promise.all(unzipPromises).then(async () => {
    for (let i = 1; i <= 10; i++) {
      let queries = new Array();
      const blackList = new Array();

      dirs.forEach((dirName) => {
        const path = `${process.cwd()}/${dirName}/query_${i}.sql`;
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
      let outcome = true;
      ext: for (let t = 0; t < queries.length; t++) {
        if (blackList.indexOf(t) !== -1) continue ext;

        int: for (let k = 0; k < queries.length; k++) {
          if (blackList.indexOf(k) !== -1 || k == t) continue int;

          try {
            const res = await client.query(
              produceQuery(queries[t].body, queries[k].body)
            );
            if (res.rowCount > 0) {
              outcome = false;
              console.log(
                `Query ${i}: detected differences between ${queries[t].author} and ${queries[k].author}, logging...`
              );
              const out = res.rows.reduce(
                (prev, current) => prev + `\n${JSON.stringify(current)}`,
                new String()
              );
              fs.writeFileSync(
                `./query_${i}-${queries[t].author}-${queries[k].author}.txt`,
                out
              );
            }
          } catch (e) {
            outcome = false;

            if (e.message == "first") {
              blackList.push(t);
              console.log(
                `Error: ${queries[t].author}'s query ${i} is missing the final ';'`
              );

              continue ext;
            }
            if (e.message == "second") {
              blackList.push(k);
              console.log(
                `Error: ${queries[k].author}'s query ${i} is missing the final ';'`
              );
              continue int;
            }

            console.log(
              `QUERY ${i} ERROR!, specifically ${queries[t].author} against ${queries[k].author}. Now testing the queries alone...`
            );
            const outcomes = new Array();
            try {
              const result = await client.query(queries[t].body);
              outcomes.push(result);
            } catch (err) {
              blackList.push(t);

              console.log(
                `${queries[t].author}'s query ${i} is faulty!`,
                err.toString().split("\n")[0]
              );
            }

            try {
              const result = await client.query(queries[k].body);
              outcomes.push(result);
            } catch (err) {
              faulty = true;
              blackList.push(k);
              console.log(
                `${queries[k].author}'s query ${i} is faulty!`,
                err.toString().split("\n")[0]
              );
            }
            if (outcomes.length == 2) {
              //it means both query works
              console.log(
                "It seems that the single queries work on their own, checking the differences..."
              );
              if (outcomes[0].fields.length == outcomes[1].fields.length) {
                for (let a = 0; a < outcomes[0].fields.length; a++) {
                  if (
                    outcomes[0].fields[a].dataTypeID !=
                    outcomes[1].fields[a].dataTypeID
                  ) {
                    console.log(
                      `It seems that the same column has two different data types (comparing column ${outcomes[0].fields[a].name} with ${outcomes[1].fields[a].name})`
                    );
                  }
                }
              } else {
                console.error("The queries have a different number of fields!");
                console.error(
                  `${queries[t].author}'s query has: ${outcomes[0].fields
                    .map((el) => el.name)
                    .join(", ")}`
                );
                console.error(
                  `${queries[k].author}'s query has: ${outcomes[1].fields
                    .map((el) => el.name)
                    .join(", ")}`
                );
              }
            }
          }
        }
      }
      if (outcome) console.log(`Query ${i} is all set for everyone!`);
      console.log("\n ================================================\n ");
    }
    cleanDirs();
    client.end();
  });
} catch (e) {
  cleanDirs();
  throw e;
}
function produceQuery(body1, body2) {
  if (body1.slice(-1) != ";") throw new Error("first");
  if (body2.slice(-1) != ";") throw new Error("second");

  return `(${body1.substring(
    0,
    body1.length - 1
  )})\n EXCEPT\n (${body2.substring(0, body2.length - 1)});`;
}
