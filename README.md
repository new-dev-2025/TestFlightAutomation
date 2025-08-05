# 🚀 TestFlight Automation

**TestFlight Automation** is a Node.js-based tool designed to automate the process of accepting Apple TestFlight invitation links. It can scrape, clean, and process emails and URLs with full automation, making it ideal for testers, developers, or QA teams who manage large-scale TestFlight testing.

---

## 📁 Setup environment
```bash
   ├── git clone git@github.com:xiaoma6869Pro/TestFlightAutomation.git
   ├── sh ctr.sh

## 📁 Project Structure
```bash
📦 TestFlight_Automation/
├── 🎯 src/
│   ├── 🤖 ASOBot/
│   │   ├── 📬 ForwardSubMailServerAutomate.js
│   │   ├── 🧹 InboxCleaner.js
│   │   ├── 🔗 RunScapperAcceptLinkTestFlight.js
│   │   ├── 🕷️ TestFlightScraper.js
│   │   └── 🌐 UITestFlightAcceptableURL.js
│   ├── 💾 data/
│   │   ├── 👤 Account.json
│   │   ├── 🍎 AppleID.json
│   │   └── 💿 backupCredentialAppleID.txt
│   └── 🛠️ utils/
│       ├── 🔗 ActivateLinkLoader.js
│       └── ⚙️ EnvLoader.js
├── 🎮 main.js
├── 📦 package.json
└── 📚 README.md