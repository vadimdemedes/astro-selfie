import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import getPort from 'get-port';
import serveHandler from 'serve-handler';
import {serve} from 'micro';
import {chromium} from 'playwright';
import type {AstroGlobal, AstroIntegration} from 'astro';

export default function selfie(): AstroIntegration {
	let publicDir: URL;

	return {
		name: 'astro-selfie',
		hooks: {
			// eslint-disable-next-line @typescript-eslint/naming-convention, object-shorthand
			'astro:config:done': ({config}) => {
				publicDir = (config as unknown as {publicDir: URL}).publicDir;
			},
			// eslint-disable-next-line @typescript-eslint/naming-convention, object-shorthand
			'astro:build:done': async ({dir, pages}) => {
				const screenshotsDir = new URL('og', publicDir);
				await fs.mkdir(fileURLToPath(screenshotsDir), {recursive: true});

				const port = await getPort();
				const baseUrl = new URL(`http://localhost:${port}`);

				const server = new http.Server(
					serve(async (request, response) => {
						await serveHandler(request, response, {
							public: fileURLToPath(dir),
						});
					}),
				);

				server.listen(port);

				const browser = await chromium.launch();

				const context = await browser.newContext({
					screen: {
						width: 1200,
						height: 600,
					},
					viewport: {
						width: 1200,
						height: 600,
					},
				});

				for (const {pathname} of pages) {
					const url = new URL(pathname, baseUrl);
					const page = await context.newPage();
					await page.goto(url.href);

					await page.evaluate('document.body.dataset.astroSelfie = true;');

					const screenshot = await page.screenshot({type: 'png'});

					const screenshotPath = path.join(
						fileURLToPath(screenshotsDir),
						pathname === '' ? 'index.png' : `${pathname}.png`,
					);

					await fs.mkdir(path.dirname(screenshotPath), {recursive: true});
					await fs.writeFile(screenshotPath, screenshot);
				}

				await browser.close();
				server.close();
			},
		},
	};
}

const stripTrailingSlash = (input: string): string => {
	return input.replace(/\/$/, '');
};

const selfiePath = (astro: AstroGlobal): string => {
	const pathname =
		astro.url.pathname === '/'
			? '/index'
			: stripTrailingSlash(astro.url.pathname);

	return `/og${pathname}.png`;
};

export const selfieUrl = (astro: AstroGlobal): URL => {
	return new URL(selfiePath(astro), astro.site);
};
