#!/usr/bin/env node

import { crawl, CrawlResult, CrawlNotify, defaultCrawlParams, CrawlParams } from "./index";
import { Stream, Transform, TransformCallback } from "stream";
import * as yargs from "yargs";
import ora from "ora";
import chalk from "chalk";
import { createJsonStringifyStream, createCsvStringifyStream } from "./transform";

function getTransform(): Transform {
  switch (argv.outputType) {
    case "csv":
      return createCsvStringifyStream();
    case "json":
      return createJsonStringifyStream();
    default:
      throw new Error("invalid output type");
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
  .option("output-type", {
    alias: "t",
    describe: "Output type.",
    choices: ["csv", "json"],
    default: "json",
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
  yargs.showHelp();
} else {
  crawl({ url: argv._[0], ...argv } as CrawlParams).then(streams => {
    const spinner = ora("Start crawling").start();
    streams.notify
      .on("data", (o: CrawlNotify) => (spinner.text = `[${chalk.blue(`processed: ${o.processed}, queued: ${o.queued}`)}]`))
      .on("close", () => spinner.stop());
    streams.data.pipe(getTransform()).pipe(process.stdout);
  });
}
