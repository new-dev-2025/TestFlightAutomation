const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');

class TestFlightExtractor {
    constructor() {
        this.imap = null;
        this.emailServers = {
            'gmail.com': { host: 'imap.gmail.com', port: 993 },
            'googlemail.com': { host: 'imap.gmail.com', port: 993 },
            'outlook.com': { host: 'outlook.office365.com', port: 993 },
            'hotmail.com': { host: 'outlook.office365.com', port: 993 },
            'live.com': { host: 'outlook.office365.com', port: 993 },
            'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
            'yahoo.co.uk': { host: 'imap.mail.yahoo.com', port: 993 },
            'icloud.com': { host: 'imap.mail.me.com', port: 993 },
            'me.com': { host: 'imap.mail.me.com', port: 993 },
            'mac.com': { host: 'imap.mail.me.com', port: 993 },
            'aol.com': { host: 'imap.aol.com', port: 993 },
            'protonmail.com': { host: 'imap.protonmail.com', port: 993 },
            'zoho.com': { host: 'imap.zoho.com', port: 993 }
        };
    }

    async getUserInput(prompt) {
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

    async getPassword(prompt) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            process.stdout.write(prompt);
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            let password = '';
            process.stdin.on('data', (char) => {
                if (char === '\n' || char === '\r' || char === '\u0004') {
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdout.write('\n');
                    rl.close();
                    resolve(password);
                } else if (char === '\u0003') {
                    process.exit();
                } else if (char === '\b' || char === '\u007f') {
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                    }
                } else {
                    password += char;
                }
            });
        });
    }

    getServerConfig(email) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain) {
            throw new Error('Invalid email format');
        }

        const config = this.emailServers[domain];
        if (!config) {
            console.log(`⚠️  Unknown email provider: ${domain}`);
            console.log('📝 Available providers:', Object.keys(this.emailServers).join(', '));
            throw new Error(`Email provider ${domain} not supported. Please add custom IMAP settings.`);
        }

        return config;
    }

    async connect(username, password) {
        return new Promise((resolve, reject) => {
            try {
                const serverConfig = this.getServerConfig(username);
                console.log(`🔗 Connecting to ${serverConfig.host}...`);

                this.imap = new Imap({
                    user: username,
                    password: password,
                    host: serverConfig.host,
                    port: serverConfig.port,
                    tls: true,
                    tlsOptions: {
                        rejectUnauthorized: false
                    }
                });

                this.imap.once('ready', () => {
                    console.log(`✅ Connected to ${serverConfig.host}!`);
                    resolve(true);
                });

                this.imap.once('error', (err) => {
                    console.log(`❌ Connection failed: ${err.message}`);
                    if (err.message.includes('Invalid credentials')) {
                        console.log('💡 Tip: Make sure you\'re using an app-specific password if required');
                    }
                    resolve(false);
                });

                this.imap.connect();
            } catch (error) {
                console.log(`❌ Setup error: ${error.message}`);
                resolve(false);
            }
        });
    }

    normalizeAppName(appName) {
        // Remove common prefixes/suffixes and normalize
        let normalized = appName
            .replace(/^(testflight[\s\-:]*)/gi, '')
            .replace(/\s*(for ios|beta|test|testing|app|application)\s*$/gi, '')
            .replace(/\s*[-–]\s*.+$/g, '') // Remove everything after dash
            .replace(/\s+by\s+.+$/gi, '') // Remove "by Developer Name"
            .trim();

        // Handle special cases
        const specialCases = {
            'vietnamgg': 'VietnamGG',
            'vietnam gg': 'VietnamGG',
            'viet nam gg': 'VietnamGG'
        };

        const lowerNormalized = normalized.toLowerCase();
        for (const [key, value] of Object.entries(specialCases)) {
            if (lowerNormalized.includes(key)) {
                return value;
            }
        }

        // Capitalize first letter of each word
        return normalized.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    extractAppName(subject, content) {
        let cleanSubject = subject.replace(/TestFlight[\s:]*-?/gi, '').trim();
        
        // Check for specific app names in content and subject
        const specificApps = ['vietnamgg', 'vietnam gg', 'viet nam gg'];
        for (const app of specificApps) {
            if (cleanSubject.toLowerCase().includes(app) || 
                (content && content.toLowerCase().includes(app))) {
                return this.normalizeAppName(app);
            }
        }
        
        // Try to extract from HTML title
        if (content) {
            let match = content.match(/<title[^>]*>([^<]+)</i);
            if (match && !match[1].toLowerCase().includes('testflight')) {
                let title = match[1].trim();
                if (title.length > 0 && title.length < 50) {
                    return this.normalizeAppName(title);
                }
            }
            
            // Try app name from meta or structured data
            match = content.match(/app[_-]?name['"\s]*[:=]\s*['"]([^'"]+)['"]/i);
            if (match) {
                return this.normalizeAppName(match[1]);
            }

            // Try to find app name in common patterns
            match = content.match(/join\s+(.+?)\s+on\s+testflight/gi);
            if (match) {
                return this.normalizeAppName(match[1]);
            }
        }
        
        // Extract from subject patterns
        let patterns = [
            /^(.+?)\s+(?:has\s+)?invited you to test/i,
            /invited to test\s+(.+)/i,
            /^([^,]+?)\s+by\s+.+/i,
            /^(.+?)\s*[-–]?\s*for iOS/i,
            /^(.+?)\s*[-–]\s*/i,
            /^([^:]+):/i
        ];

        for (const pattern of patterns) {
            let match = cleanSubject.match(pattern);
            if (match) {
                let appName = match[1].trim();
                if (appName.length > 0 && appName.length < 50 && 
                    !appName.match(/^\d+$/) && 
                    !['invited', 'you', 'to', 'test', 'testflight'].includes(appName.toLowerCase())) {
                    return this.normalizeAppName(appName);
                }
            }
        }
        
        // Final cleanup attempt
        let finalClean = cleanSubject
            .replace(/\b(TestFlight|invited?|you|to|test|has|been|for|iOS|by|Ebrartelek|ANASRE)\b/gi, '')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (finalClean.length > 0 && finalClean.length < 30 && !finalClean.match(/^\d+$/)) {
            return this.normalizeAppName(finalClean);
        }
        
        return 'Unknown App';
    }

    extractTestFlightUrls(content) {
        if (!content) return [];

        const patterns = [
            /href=["']([^"']*testflight\.apple\.com\/v1\/invite\/[A-Za-z0-9a-f]+[^"']*?)["']/gi,
            /href=["']([^"']*testflight\.apple\.com\/join\/[A-Za-z0-9]+[^"']*?)["']/gi,
            /(https:\/\/testflight\.apple\.com\/v1\/invite\/[A-Za-z0-9a-f]+[^\s<>"'\)]*)/gi,
            /(https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+[^\s<>"'\)]*)/gi,
        ];

        const urls = new Set();

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                let url = match[1] || match[0];
                
                // Clean up HTML entities
                url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                
                // Remove trailing punctuation
                url = url.replace(/[.,;:!?)\]}>'"]+$/, '');
                
                // Validate URL
                if (url && 
                    url.includes('testflight.apple.com') && 
                    url.length > 50 &&
                    !url.endsWith('=') &&
                    (url.includes('/v1/invite/') || url.includes('/join/')) &&
                    !url.includes('...') &&
                    url.match(/[A-Za-z0-9a-f]{8,}/)) {
                    urls.add(url);
                }
            }
        });

        // Remove truncated URLs
        const urlArray = Array.from(urls);
        const cleanUrls = [];
        
        urlArray.forEach(url => {
            const isTruncated = urlArray.some(otherUrl => 
                otherUrl !== url && 
                otherUrl.startsWith(url) && 
                otherUrl.length > url.length
            );
            
            if (!isTruncated) {
                cleanUrls.push(url);
            }
        });

        return cleanUrls;
    }

    async processEmails() {
        return new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`📧 Inbox has ${box.messages.total} total messages`);

                // Process more emails to find more TestFlight invites
                const recentCount = Math.min(200, box.messages.total);
                const start = Math.max(1, box.messages.total - recentCount + 1);
                const end = box.messages.total;

                console.log(`🔍 Processing last ${recentCount} emails (${start}:${end})...`);

                const f = this.imap.seq.fetch(`${start}:${end}`, {
                    bodies: '',
                    struct: true
                });

                const foundUrls = [];
                let processedCount = 0;
                let emailsWithUrls = 0;

                f.on('message', (msg, seqno) => {
                    console.log(`📧 Processing email ${seqno}/${end}...`);

                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });

                        stream.on('end', () => {
                            simpleParser(buffer)
                                .then(parsed => {
                                    const subject = parsed.subject || 'No Subject';
                                    console.log(`   📋 Subject: ${subject.substring(0, 60)}...`);

                                    // Get all content
                                    let allContent = '';
                                    if (parsed.html) allContent += parsed.html;
                                    if (parsed.text) allContent += parsed.text;
                                    allContent += buffer;

                                    // Extract URLs
                                    const urls = this.extractTestFlightUrls(allContent);

                                    if (urls.length > 0) {
                                        console.log(`   🎉 Found ${urls.length} TestFlight URL(s)!`);
                                        
                                        urls.forEach(url => {
                                            const appName = this.extractAppName(subject, allContent);
                                            foundUrls.push({
                                                url: url,
                                                appName: appName,
                                                subject: subject,
                                                date: parsed.date || new Date()
                                            });
                                            console.log(`   📱 ${appName}: ${url.substring(0, 60)}...`);
                                        });
                                        emailsWithUrls++;
                                    } else if (allContent.toLowerCase().includes('testflight')) {
                                        console.log('   🔍 TestFlight email but no URLs found');
                                    } else {
                                        console.log('   ℹ️  Not a TestFlight email');
                                    }

                                    processedCount++;
                                })
                                .catch(parseErr => {
                                    console.log(`   ❌ Parse error: ${parseErr.message}`);
                                    
                                    // Try raw extraction
                                    const urls = this.extractTestFlightUrls(buffer);
                                    if (urls.length > 0) {
                                        console.log(`   🎉 Found ${urls.length} URL(s) in raw content!`);
                                        urls.forEach(url => {
                                            const appName = this.extractAppName('Raw Email', buffer);
                                            foundUrls.push({
                                                url: url,
                                                appName: appName,
                                                subject: 'Raw Email',
                                                date: new Date()
                                            });
                                        });
                                        emailsWithUrls++;
                                    }
                                    
                                    processedCount++;
                                });
                        });
                    });
                });

                f.once('error', (err) => {
                    reject(err);
                });

                f.once('end', () => {
                    // Wait for parsing to complete
                    setTimeout(() => {
                        console.log(`\n📊 Processing Summary:`);
                        console.log(`   📧 Emails processed: ${processedCount}`);
                        console.log(`   ✅ Emails with URLs: ${emailsWithUrls}`);
                        
                        resolve(foundUrls);
                    }, 3000);
                });
            });
        });
    }

    groupAndSaveResults(urlData) {
        // Group URLs by normalized app name
        const appGroups = {};
        const duplicateUrls = new Set();

        urlData.forEach(item => {
            const url = item.url;
            
            // Validate URL
            if (url.length > 50 && 
                !url.endsWith('=') && 
                !url.includes('...') && 
                (url.includes('/v1/invite/') || url.includes('/join/')) &&
                url.match(/[A-Za-z0-9a-f]{8,}/)) {
                
                const appName = item.appName;
                
                if (!appGroups[appName]) {
                    appGroups[appName] = {
                        urls: new Set(),
                        subjects: new Set(),
                        latestDate: item.date
                    };
                }
                
                // Check for duplicates across all apps
                if (!duplicateUrls.has(url)) {
                    appGroups[appName].urls.add(url);
                    duplicateUrls.add(url);
                    appGroups[appName].subjects.add(item.subject);
                    
                    // Keep latest date
                    if (item.date > appGroups[appName].latestDate) {
                        appGroups[appName].latestDate = item.date;
                    }
                }
            }
        });

        const totalValidUrls = Object.values(appGroups).reduce((sum, group) => sum + group.urls.size, 0);

        console.log(`\n🎯 RESULTS:`);
        console.log(`🔗 Raw URLs found: ${urlData.length}`);
        console.log(`✅ Valid TestFlight URLs: ${totalValidUrls}`);
        console.log(`📱 Apps found: ${Object.keys(appGroups).length}`);

        if (totalValidUrls > 0) {
            // Sort apps by name
            const sortedApps = Object.keys(appGroups).sort();
            
            console.log(`\n📱 TestFlight URLs Grouped by App:`);
            console.log('='.repeat(80));
            
            sortedApps.forEach(appName => {
                const group = appGroups[appName];
                const urls = Array.from(group.urls);
                console.log(`\n🎮 ${appName} (${urls.length} URL${urls.length > 1 ? 's' : ''})`);
                console.log(`   📅 Latest: ${group.latestDate.toLocaleDateString()}`);
                urls.forEach((url, index) => {
                    console.log(`   ${index + 1}. ${url}`);
                });
            });

            // Save to file
            const timestamp = new Date().toISOString().split('T')[0] + '_' + 
                             new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const filename = `TestFlight_Apps_Grouped_${timestamp}.txt`;

            let content = 'TestFlight URLs Grouped by App Name\n';
            content += '='.repeat(50) + '\n\n';
            content += `📊 Summary:\n`;
            content += `   • Total Apps: ${Object.keys(appGroups).length}\n`;
            content += `   • Total URLs: ${totalValidUrls}\n`;
            content += `   • Generated: ${new Date().toLocaleString()}\n\n`;
            content += '='.repeat(50) + '\n\n';
            
            sortedApps.forEach(appName => {
                const group = appGroups[appName];
                const urls = Array.from(group.urls);
                
                content += `📱 ${appName.toUpperCase()}\n`;
                content += '─'.repeat(appName.length + 3) + '\n';
                content += `Latest Email: ${group.latestDate.toLocaleDateString()}\n`;
                content += `URLs Found: ${urls.length}\n\n`;
                
                urls.forEach((url, index) => {
                    content += `${index + 1}. ${url}\n`;
                });
                content += '\n' + '─'.repeat(50) + '\n\n';
            });

            content += '\n💡 Instructions:\n';
            content += '   1. Click any URL to open TestFlight\n';
            content += '   2. Install the TestFlight app if you haven\'t already\n';
            content += '   3. Join the beta testing programs\n';
            content += '   4. URLs are grouped by app name for easy organization\n';

            fs.writeFileSync(filename, content, 'utf8');
            console.log(`\n💾 Grouped results saved to: ${filename}`);
            console.log(`🚀 All URLs are organized by app name - click to join TestFlight betas!`);
            
            return { filename, totalApps: Object.keys(appGroups).length, totalUrls: totalValidUrls };
        } else {
            console.log('\n❌ No TestFlight URLs found');
            console.log('💡 Tips:');
            console.log('   • Check your spam/junk folder');
            console.log('   • Make sure you have TestFlight invitation emails');
            console.log('   • Try increasing the email search range');
            return null;
        }
    }

    disconnect() {
        if (this.imap) {
            this.imap.end();
            console.log('🔌 Disconnected from email server');
        }
    }
}

// Main function
async function main() {
    console.log('🍎 Enhanced TestFlight URL Extractor');
    console.log('📱 Supports multiple email providers & better app grouping');
    console.log('='.repeat(60));
    console.log();

    const extractor = new TestFlightExtractor();

    try {
        // Get credentials
        const username = await extractor.getUserInput('📧 Email address: ');
        const password = await extractor.getPassword('🔐 Password (or app-specific password): ');

        // Connect
        const connected = await extractor.connect(username, password);
        if (!connected) {
            return;
        }

        // Process emails
        console.log('\n🔍 Searching for TestFlight invitations...');
        const urlData = await extractor.processEmails();

        // Group and save results
        const results = extractor.groupAndSaveResults(urlData);
        
        if (results) {
            console.log(`\n✨ Success! Found ${results.totalUrls} URLs for ${results.totalApps} apps`);
            console.log(`📄 Results saved to: ${results.filename}`);
        }

    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        if (error.message.includes('AUTHENTICATIONFAILED')) {
            console.log('💡 Authentication failed. Please check:');
            console.log('   • Your email and password are correct');
            console.log('   • Enable 2FA and use app-specific password (Gmail, iCloud)');
            console.log('   • Enable "Less secure apps" if required');
        }
    } finally {
        extractor.disconnect();
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n⏹️  Cancelled by user');
    process.exit(0);
});

// Run if this is the main module
if (require.main === module) {
    main();
}