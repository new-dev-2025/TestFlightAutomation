const readline = require('readline');
const { RunAcceptableInvitationLinkURL } = require('./ASOBot/UITestFlightAcceptableURL');
const { RunForwardMailToMainMailServer } = require('./ASOBot/ForwardMailServerAutomate');
const { RunClearInboxAppleID } = require('./ASOBot/InboxCleaner');
const { RunTestFlightScrapper } = require('./ASOBot/TestFlightScraper');
const { RunAcceptableInviteLinkScrapper } = require('./ASOBot/RunScapperAcceptLinkTestFlight');

async function getInputOptionASOBotAutomation(prompt) {
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

async function mainASOTesflightAutomation() {
    console.log('\n=== ASO TestFlight Automation System ===');
    console.log('0. Terminate');
    console.log('1. Run Chrome UI: Scrape Acceptable TestFlight Invitation URLs');
    console.log('2. Forward Sub Mail to Main Server');
    console.log('3. Clear Apple ID Inbox');
    console.log('4. Scrape TestFlight Links from Main Mail Server');
    console.log('5. Scrape Acceptable Invitable Links from Main Server');

    const optionInput = await getInputOptionASOBotAutomation('Select (1-6): ');
    const choice = parseInt(optionInput);

    switch (choice) {
        case 0:
            console.log('Goodby..........');
            process.exit(0);
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
        default:
            console.log('Invalid option. Please select 0-5.');
    }
    mainASOTesflightAutomation();
}

mainASOTesflightAutomation();