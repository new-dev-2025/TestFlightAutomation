const puppeteer = require('puppeteer');

async function loginToWebsite(url, username, password, usernameSelector, passwordSelector, loginButtonSelector) {
    const browser = await puppeteer.launch({ headless: false }); // Set to true for headless mode
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Type in username/email
        await page.type(usernameSelector, username);

        // Type in password
        await page.type(passwordSelector, password);

        // Click the login button
        await page.click(loginButtonSelector);

        // Wait for navigation after login (adjust as needed)
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        console.log('Login successful!');
    } catch (error) {
        console.error('Login failed:', error);
    } finally {
        // await browser.close();
    }
}

// Example usage for GitHub (selectors may need adjustment based on current GitHub UI)
const githubUrl = 'https://github.com/login';
const githubUsername = 'your_github_username';
const githubPassword = 'your_github_password';
const githubUsernameSelector = '#login_field';
const githubPasswordSelector = '#password';
const githubLoginButtonSelector = '.js-sign-in-button';

loginToWebsite(githubUrl, githubUsername, githubPassword, githubUsernameSelector, githubPasswordSelector, githubLoginButtonSelector);