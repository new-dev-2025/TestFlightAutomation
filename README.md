# 🚀 TestFlight Automation

**TestFlight Automation** is a Node.js-based tool designed to automate the process of accepting Apple TestFlight invitation links. It can scrape, clean, and process emails and URLs with full automation, making it ideal for testers, developers, or QA teams who manage large-scale TestFlight testing.

---

## 📁 Project Structure

```bash
TestFlight_Automation/
├── node_modules/                  # Node.js dependencies
├── src/
│   ├── ASOBot/                    # Core automation logic
│   │   ├── ForwardMailServerAutomate.js      # Forwards relevant emails
│   │   ├── InboxCleaner.js                    # Cleans inbox or removes old data
│   │   ├── RunScapperAcceptLinkTestFlight.js # Main orchestrator
│   │   ├── TestFlightScraper.js              # Extracts TestFlight links
│   │   └── UITestFlightAcceptableURL.js      # Validates UI-based links
│   ├── data/                     # Stores intermediate or raw data
│   └── utils/                    # Utility modules (e.g., link loaders)
│       └── ActivateLinkLoader.js
├── main.js                        # Entry point (can be customized)
├── .env                           # Environment configuration (ignored by Git)
├── .gitignore                     # Files to ignore in version control
├── ActivationLinks.txt           # Input list of TestFlight links (if needed)
├── ctr.sh                         # Bash script to control automation
├── package.json                   # Node.js dependencies and scripts
└── README.md                      # Project documentation