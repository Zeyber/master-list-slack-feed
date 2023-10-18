import { Injectable } from '@nestjs/common';
import { Browser, Page } from 'puppeteer';
import { getBrowser } from './puppeteer.utils';
import { of } from 'rxjs';

const ICON_PATH = '/assets/icon-slack.png';
const CLIENT_URL = 'https://app.slack.com/client';

@Injectable()
export class AppService {
  browser: Browser;
  page: Page;
  initialized = false;

  async initialize() {
    this.browser = await getBrowser();
    this.page = await this.browser.newPage();

    // Disable timeout for slower devices
    this.page.setDefaultNavigationTimeout(0);
    this.page.setDefaultTimeout(0);

    this.page.goto(CLIENT_URL, {
      waitUntil: ['load', 'networkidle2'],
    });

    await this.page.waitForNavigation();
    const signedIn = this.page.url().includes(CLIENT_URL);

    if (!signedIn) {
      await this.page.waitForTimeout(1000);
      await this.browser.close();
      await this.login();
      this.initialize();
    } else {
      // Open new message window to change view off channels
      const newMessageBtn = await this.page.waitForSelector(
        'button[aria-label="New message"]',
      );
      await newMessageBtn.click();

      this.initialized = true;
      console.log('Slack initialized.');
    }
  }

  getData() {
    if (this.initialized) {
      return this.getThreads();
    } else {
      return of({
        data: [{ message: 'Slack feed not initialized', icon: ICON_PATH }],
      });
    }
  }

  login() {
    return new Promise(async (resolve) => {
      const SIGN_IN_URL = 'https://slack.com/signin#/signin';

      this.browser = await getBrowser({
        headless: false,
        userDataDir: './puppeteer-slack-session',
      });
      this.page = await this.browser.newPage();
      // Disable timeout for slower devices
      this.page.setDefaultNavigationTimeout(0);
      this.page.setDefaultTimeout(0);

      console.log('Opening sign in page...');
      await this.page.goto(SIGN_IN_URL, {
        waitUntil: ['load', 'networkidle2'],
      });

      console.log('Please login to Slack');
      await this.page.waitForFunction(
        `window.location.href.includes('https://app.slack.com/client')`,
      );

      await this.browser.close();

      console.log('Slack signed in!');
      resolve(true);
    });
  }

  async getThreads(): Promise<any> {
    return new Promise(async (resolve, reject) => {
      await (async () => {
        try {
          const threadList = await this.page.waitForSelector(
            '[aria-label="Channels and direct messages"]',
          );
          const threads = await threadList.$$('[role="treeitem"]');
          if (threads.length) {
            const items = [];
            for (const thread of threads) {
              const unread = await thread.$(
                '.p-channel_sidebar__channel--unread',
              );

              const unreadLink = await thread.$(
                '.p-channel_sidebar__link--unread',
              );

              const muted = await thread.$(
                '.p-channel_sidebar__channel--muted',
              );

              if ((unread || unreadLink) && !muted) {
                const threadText: string = await this.page.evaluate(
                  (el: HTMLElement) => el.innerText,
                  thread,
                );
                const name = threadText.split('\n')[0];
                items.push({ message: name, icon: ICON_PATH });
              }
            }
            resolve({ data: items });
          }
        } catch (e) {
          reject(e);
        }
      })();
    });
  }
}
