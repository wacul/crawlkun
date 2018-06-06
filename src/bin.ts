#!/usr/bin/env node

import { crawl, CrawlResult, CrawlNotify, defaultCrawlPamrams } from "./index";
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
    default: defaultCrawlPamrams.interval,
  })
  .option("connections", {
    alias: "c",
    describe: "Set a length of connetions",
    default: defaultCrawlPamrams.connections,
  })
  .options("retry", {
    alias: "r",
    describe: "Set a retry count",
    default: defaultCrawlPamrams.retryCount,
  })
  .option("out", {
    alias: "o",
    describe: "Output path.",
    type: "string",
    required: true,
  })
  .help("h").argv;

if (!argv._.length) {
  yargs.showHelp();
} else {
  crawl({ url: argv._[0], interval: argv.interval, connections: argv.connections }).then(streams => {
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
