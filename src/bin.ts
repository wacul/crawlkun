#!/usr/bin/env node

import { crawl, CrawlResult, CrawlNotify, defaultCrawlParams, CrawlParams } from "./index";
import { Stream, Transform, TransformCallback } from "stream";
import * as yargs from "yargs";
import * as fs from "fs";
import ora from "ora";

class LineTransform extends Transform {
  _transform(chunk: string, encoding: string, callback: TransformCallback) {
    const o = JSON.parse(chunk);
    callback(undefined, `${o.url},${o.title},${o.description}\n`);
  }
}

const argv = yargs
  .option("interval", {
    alias: "i",
    describe: "Set an intaval time of crawling.",
    type: "string",
    default: defaultCrawlParams.interval,
  })
  .option("connections", {
    alias: "c",
    describe: "Set a length of connetions",
    type: "number",
    default: defaultCrawlParams.connections,
  })
  .options("retry-count", {
    alias: "r",
    describe: "Set a retry count",
    type: "number",
    default: defaultCrawlParams.retryCount,
  })
  .option("out", {
    alias: "o",
    describe: "Output path.",
    type: "string",
    required: true,
  })
  .options("ignore-trailing-slash", {
    describe: "Ignore trailing slash.",
    type: "boolean",
    default: defaultCrawlParams.ignoreTrailingSlash,
  })
  .options("ignore-query-params", {
    describe: "Ignore query paramaters.",
    type: "boolean",
    default: defaultCrawlParams.ignoreQueryParams,
  })
  .options("ignore-hash", {
    describe: "Ignore url hash.",
    type: "boolean",
    default: defaultCrawlParams.ignoreHash,
  })
  .help("h").argv;

if (!argv._.length) {
  console.log(argv.retryCount);
  // yargs.showHelp();
} else {
  crawl({ url: argv._[0], ...argv } as CrawlParams).then(streams => {
    const fileWriter = fs.createWriteStream(argv.out, "utf8");
    const spinner = ora("Start crawling").start();
    streams.notify.on("data", (chunk: string) => {
      const o = JSON.parse(chunk) as CrawlNotify;
      if (o.finished) {
        spinner.stop();
      }
      spinner.text = `processed: ${o.processed}, queued: ${o.queued}, sum: ${o.sum}`;
    });
    streams.data.pipe(new LineTransform()).pipe(fileWriter);
  });
}
