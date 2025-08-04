const readline = require('readline');
const { RunClearInboxAppleID } = require('./InboxCleaner');
const { RunForwardMailToMainMailServer } = require('./ForwardMailServerAutomate');
const { RunAcceptableInvitationLinkURL } = require('./UITestFlightAcceptableURL');
const { RunTestFlightScrapper } = require('./TestFlightScraper');
const { RunAcceptableInviteLinkScrapper } = require('./RunScapperAcceptLinkTestFlight');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function showMenu() {
    console.log('\n1. Automation Acceptable Invitation Link');
    console.log('2. Forward Sub Mail To Main Server');
    console.log('3. Clear AppleID Inbox');
    console.log('4. Scrapper TestFlight From Main Mail Server');
    console.log('5. Run Acceptable Invitation TestFlight URL Scrapper');
    console.log('6. Exit');
    
    rl.question('Select (1-6): ', async (input) => {
        const choice = parseInt(input);
        
        try {
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
                    rl.close();
                    return;
                default:
                    console.log('Invalid option. Please select 1-6.');
            }
        } catch (error) {
            console.error('Error:', error.message);
        }
        
        // Return to menu after function completes
        if (choice !== 6) {
            showMenu();
        }
    });
}

rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
});

showMenu();