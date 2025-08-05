const readline = require('readline');
const { RunAcceptableInvitationLinkURL } = require('./ASOBot/UITestFlightAcceptableURL');
const { RunForwardMailToMainMailServer } = require('./ASOBot/ForwardMailServerAutomate');
const { RunClearInboxAppleID } = require('./ASOBot/InboxCleaner');
const { RunTestFlightScrapper } = require('./ASOBot/TestFlightScraper');
const { RunAcceptableInviteLinkScrapper } = require('./ASOBot/RunScapperAcceptLinkTestFlight');

async function getOptionInput(prompt) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function showMenu() {
    console.log('\n1. Run ChromeUI Acceptable Invitation TestFlight URL Scrapper');
    console.log('2. Forward Sub Mail To Main Server');
    console.log('3. Clear AppleID Inbox');
    console.log('4. Scrapper TestFlight Link From Main Mail Server');
    console.log('5. Run Scrapper Fetch Acceptable Invitable Link From Main Server');
    console.log('6. Exit');

    const optionInput = await getOptionInput('Select (1-6): ');
    const choice = parseInt(optionInput);

    switch (choice) {
        case 1:
            await RunAcceptableInvitationLinkURL();
            break;
        case 2:
            await RunForwardMailToMainMailServer();
            break;
        case 3:
            await RunClearInboxAppleID();
            break;
        case 4:
            await RunTestFlightScrapper();
            break;
        case 5:
            await RunAcceptableInviteLinkScrapper();
            break;
        case 6:
            console.log('Exiting...');
            process.exit(0);
        default:
            console.log('Invalid option. Please select 1-6.');
    }

    showMenu();
}

showMenu();