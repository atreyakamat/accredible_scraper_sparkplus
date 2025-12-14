const { chromium } = require('playwright');

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function discoverWallet(certUrl) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        console.log(`Navigating to certificate: ${certUrl}`);
        await page.goto(certUrl, { waitUntil: 'networkidle' });

        // Look for the "View all credentials" link
        // Selector based on requirements: a[data-cy="view-all-credentials-link"]
        const walletSelector = 'a[data-cy="view-all-credentials-link"]';
        
        // Wait a bit for JS to render if networkidle wasn't enough
        try {
            await page.waitForSelector(walletSelector, { timeout: 5000 });
        } catch (e) {
            throw new Error("Public wallet link not found on this certificate page.");
        }

        const href = await page.getAttribute(walletSelector, 'href');
        
        if (!href) {
            throw new Error("Wallet link found but has no href.");
        }

        // Construct full URL. Usually href is relative like /profile/uuid/wallet
        const urlObj = new URL(certUrl);
        const walletUrl = `${urlObj.protocol}//${urlObj.host}${href}`;

        return walletUrl;

    } catch (error) {
        console.error("Discovery Error:", error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

async function scrapeWalletCredentials(walletUrl) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const credentials = [];

    try {
        console.log(`Scraping wallet: ${walletUrl}`);
        await page.goto(walletUrl, { waitUntil: 'networkidle' });

        // Wait for credential cards to load. 
        // Accredible usually uses specific classes, but we'll look for generic anchors first
        // then filter by href domain.
        await page.waitForTimeout(3000); // Safety wait for rendering

        const links = await page.$$eval('a', (anchors) => {
            return anchors.map(a => a.href);
        });

        const uniqueLinks = new Set();

        for (const link of links) {
            if (link.includes('credential.net') || link.includes('accredible.com')) {
                // Extract UUID to verify it's a credential link
                const match = link.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                if (match) {
                    uniqueLinks.add(link);
                }
            }
        }

        for (const link of uniqueLinks) {
            const match = link.match(UUID_REGEX);
            if (match) {
                const urlObj = new URL(link);
                credentials.push({
                    credential_uuid: match[0],
                    credential_url: link,
                    issuer_domain: urlObj.hostname
                });
            }
        }

        return credentials;

    } catch (error) {
        console.error("Wallet Scrape Error:", error.message);
        throw error;
    } finally {
        await browser.close();
    }
}

module.exports = { discoverWallet, scrapeWalletCredentials };
