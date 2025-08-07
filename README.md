# 🚀 TestFlight Automation

**TestFlight Automation** is a Node.js-based tool designed to automate the process of accepting Apple TestFlight invitation links. It can scrape, clean, and process emails and URLs with full automation, making it ideal for testers, developers, or QA teams who manage large-scale TestFlight testing.

---

## ⚙️ Setup environment
```bash
   ├── 📥 git clone git@github.com:xiaoma6869Pro/TestFlightAutomation.git
   ├── 🚀 sh ctr.sh

## 🚀 Run Project ( Enter number 0-5 in order to execute bots)
├── 🎮 node src/main.js
    ├── 🛑 0. Terminate the system
    ├── 🌐 1. Run chrome automation to acceptable invitation link
    ├── 📧 2. Run Forward Sub Mail to Main Server
    ├── 🧹 3. Clear Apple ID Inbox
    ├── 🕷️ 4. Scrape TestFlight Links from Main Mail Server
    ├── 🔗 5. Scrape Acceptable Invitable Links from Main Server

## 📁 Project Structure

```bash
📦 TestFlight_Automation/
├── 🎯 src/
│   ├── 🤖 ASOBot/
│   │   ├── 📬 ForwardSubMailServerAutomate.js
│   │   ├── 🗑️ InboxCleaner.js
│   │   ├── ⚡ RunScapperAcceptLinkTestFlight.js
│   │   ├── 🔍 TestFlightScraper.js
│   │   └── 🖥️ UITestFlightAcceptableURL.js
│   ├── 💾 data/
│   │   ├── 👤 Account.json
│   │   ├── 🍎 AppleID.json
│   │   └── 💿 backupCredentialAppleID.txt
│   └── 🛠️ utils/
│       ├── 🔓 ActivateLinkLoader.js
│       └── 📋 EnvLoader.js
├── 📄 main.js
├── 📘 package.json
└── 📚 README.md