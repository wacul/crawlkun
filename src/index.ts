import { Readable, Stream } from "stream";
import puppeteer from "puppeteer";

export interface CrawlResult {
  url: string;
  title: string;
  description: string;
}

export interface CrawlNotify {
  processed: number;
  sum: number;
  url: string;
  queued: number;
  finished: string;
}

export interface CrawlParams {
  url: string;
  interval?: number;
  connections?: number;
  retryCount?: number;
  ignoreTrailingSlash?: boolean;
  ignoreQueryParams?: boolean;
  ignoreHash?: boolean;
}

export const defaultCrawlParams: CrawlParams = {
  url: "",
  interval: 500,
  connections: 1,
  retryCount: 5,
  ignoreTrailingSlash: true,
  ignoreQueryParams: true,
  ignoreHash: true,
};

export type CrawlHooks<T1, T2, T3, T4> = () =>
  | [() => T1]
  | [() => T1, () => T2]
  | [() => T1, () => T2, () => T3]
  | [() => T1, () => T2, () => T3, () => T4]
  | (() => any)[];

async function wait(t = 100) {
  await new Promise(resolve => setTimeout(resolve, t));
}

// for page.evaluate
async function getTitleAndDescription() {
  const title = document.querySelector("title");
  const meta = document.querySelector("meta[name=description]");
  const o: { [key: string]: any } = {};
  if (title) Object.assign(o, { title: (title.textContent || "").trim() });
  if (meta) Object.assign(o, { description: (meta.getAttribute("content") || "").trim() });
  return o;
}

// for page.evaluate
async function collectUrls(baseUrl: string) {
  return [...document.querySelectorAll("a")].map(el => el.href).filter(s => s.startsWith(baseUrl));
}

function normalizeUrl(s: string, params: CrawlParams) {
  if (params.ignoreQueryParams) s = s.split("?").shift() as string;
  if (params.ignoreHash) s = s.split("#").shift() as string;
  if (params.ignoreTrailingSlash && /\/$/.test(s)) s = s.slice(0, -1);
  return s;
}

class Crawler {
  private page!: puppeteer.Page;
  status: "running" | "stop" = "stop";

  constructor(
    private params: CrawlParams,
    private browser: puppeteer.Browser,
    private queue: string[],
    private urlMap: { [url: string]: boolean },
    private streams: { data: Readable; notify: Readable },
    private record: { processed: number; sum: number },
  ) {}

  async start() {
    this.status = "running";
    if (!this.page) this.page = await this.browser.newPage();
    while (this.queue.length && this.status === "running") {
      await this.crawl();
      await wait(this.params.interval);
    }
    this.stop();
  }

  stop() {
    this.status = "stop";
  }

  async crawl() {
    const url = this.queue.shift() as string;
    this.notify();

    let retryCount = 0;
    while (retryCount < (this.params.retryCount as number)) {
      try {
        await this.page.goto(url, { timeout: 5000 + Math.pow(2, retryCount) * 1000, waitUntil: "networkidle2" });
        break;
      } catch (e) {
        retryCount++;
      }
    }
    if (retryCount === this.params.retryCount) {
      this.streams.data.push(JSON.stringify({ url }));
    }

    const o = { url, ...(await this.page.evaluate(getTitleAndDescription)) };
    // if (Array.isArray(hooks)) {
    //   for (let i = 0; i < hooks.length; ++i) {
    //     Object.assign(o, await page.evaluate(hooks[i]));
    //   }
    // }
    this.streams.data.push(JSON.stringify(o));
    const urls = (await this.page.evaluate(collectUrls, this.params.url)).filter((s: string) => {
      if (!this.urlMap[normalizeUrl(s, this.params)]) {
        this.urlMap[normalizeUrl(s, this.params)] = true;
        return true;
      } else {
        return false;
      }
    });
    this.record.sum += urls.length;
    this.record.processed++;
    this.queue.push(...urls);
    this.notify();
  }

  private notify() {
    this.streams.notify.push(
      JSON.stringify({
        queued: this.queue.length,
        ...this.record,
      }),
    );
  }
}

class CrawlersRunner {
  private exitCallbacks: (() => any)[] = [];
  constructor(private crawlers: Crawler[]) {}

  start() {
    this._start();
  }

  private async _start() {
    do {
      this.crawlers.forEach(c => c.status === "stop" && c.start());
      await wait();
    } while (this.crawlers.some(c => c.status === "running"));
    this.exitCallbacks.forEach(cb => cb());
  }

  onExit(callback: () => any) {
    this.exitCallbacks.push(callback);
  }
}

export async function crawl<T1 = {}, T2 = {}, T3 = {}, T4 = {}>(
  params: CrawlParams,
  hooks?: CrawlHooks<T1, T2, T3, T4>,
): Promise<{ data: Readable; notify: Readable }> {
  const data = new Readable({ read() {} });
  const notify = new Readable({ read() {} });
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-http2"],
  });
  const queue: string[] = [params.url];
  const urlMap: { [url: string]: boolean } = {};
  urlMap[normalizeUrl(params.url, params)] = true;

  const exit = async (message = "Finished!") => {
    notify.push(JSON.stringify({ finished: message }));
    await browser.close();
    process.exit();
  };

  process.on("SIGINT", () => exit("Killed!"));
  process.on("SIGUSR1", () => exit("Killed!"));
  process.on("SIGUSR2", () => exit("Killed!"));
  process.on("uncaughtException", () => exit("Error!"));

  const streams = { data, notify };
  const record = { processed: 0, sum: 1 };
  const crawlers = Array.from({ length: params.connections as number }).map(
    () => new Crawler(params, browser, queue, urlMap, streams, record),
  );

  const runner = new CrawlersRunner(crawlers);
  runner.start();
  runner.onExit(exit);

  return streams;
}
