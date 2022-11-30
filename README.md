# UNITN-DATABASE-UTILS

This utils allows to check the correctness of multiple zip files formatted according to the standard provided by professor Velegrakis.

## USAGE

#### RUNNING THE TOOL

1. run

   > `npm i -g unitn-database-utils`

   or

   > `pnpm i -g unitn-database-utils`

   if you're using pnpm

2. create a folder containing all the zip archives you wish to check, formatted as required by the professor (**WARNING: failing to comply to the given specs will result in an error!!**)
3. create a `.env`
   file containing the psql connection parameters, as follows:

   ```
   DB_USER=exampleuser
   DB_HOST=examplehost
   DATABASE=exampledatabase
   PASSWORD=examplepassword
   PORT=exampleport
   ```

   Note that the parameters are directly passed to psql, so if you usually connect from terminal by just typing `psql` with no additional parameters, then you can omit the `.env` file altogether and is _should_ workd.

   You can also omit parameters you don't need, such as `PASSWORD` if you don't need it.

4. open a terminal in the directory you just created, and run `freciagrosa`,

### READING THE OUTPUT

The script will produce files containing the differences between the queries' results, using the following convention:

    query_<query-number>-<author-1>-<author-2>.txt

where

- `query_number` is the number of the query for which the results differ,
- `author-1` and `author-2` are the authors of the queries being compared. Specifically, the file will contain all the tuples that appear in the author-1's results but **NOT** in the author-2's results.
For anyone interested this is achieved by running:<br>
`(author-1-s query) EXCEPT (author-2's query)`<br>
so if the query fails it could be due the columns returned by the single queries.

`SQL_123456.zip`

### UNDERSTANDING THE ERROR MESSAGES

The script should be solid enough to handle malformed input, but as a general rule of thumb note that if it's crashing it's probably your queries'fault, usually the final `;` is missing or you are returning the wrong number/order of columns.

