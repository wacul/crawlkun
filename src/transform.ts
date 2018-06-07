import through2 from "through2";
import { Transform } from "stream";

export function createJsonStringifyStream(): Transform {
  return through2.obj(function(chunk, enc, callback) {
    this.push(JSON.stringify(chunk));
    callback();
  });
}

export function createCsvStringifyStream(columnNames: string[] = [], delimiter = ","): Transform {
  let isFirstRow = true;
  const re = new RegExp(delimiter, "g");
  function normalize(s: string) {
    return s
      .trim()
      .replace(re, "\\" + delimiter)
      .replace(/\r\n|\n|\r/g, "");
  }

  return through2.obj(function(chunk, enc, callback) {
    if (isFirstRow) {
      const keys = Object.keys(chunk);
      keys.forEach(k => !columnNames.includes(k) && columnNames.push(k));
      this.push(columnNames.join(delimiter) + "\n");
    }
    this.push(columnNames.map(name => normalize(chunk[name])).join(delimiter) + "\n");
    callback();
  });
}
