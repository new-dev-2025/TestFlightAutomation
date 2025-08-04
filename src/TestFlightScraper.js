const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');

class TestFlightExtractor {
    constructor() {
        this.imap = null;
    }

    // Get user input
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

    // Get password (hidden input)
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

    // Connect to iCloud
    async connect(username, password) {
        return new Promise((resolve, reject) => {
            console.log('🔗 Connecting to iCloud...');

            this.imap = new Imap({
                user: username,
                password: password,
                host: 'imap.mail.me.com',
                port: 993,
                tls: true,
                tlsOptions: {
                    rejectUnauthorized: false
                }
            });

            this.imap.once('ready', () => {
                console.log('✅ Connected to iCloud!');
                resolve(true);
            });

            this.imap.once('error', (err) => {
                console.log(`❌ Connection failed: ${err.message}`);
                resolve(false);
            });

            this.imap.connect();
        });
    }

    // Extract app name from subject or content
    extractAppName(subject, content) {
        // Try to extract app name from common patterns
        
        // Pattern 1: "AppName has invited you to test"
        let match = subject.match(/(.+?)\s+has invited you to test/i);
        if (match) return match[1].trim();
        
        // Pattern 2: "You've been invited to test AppName"
        match = subject.match(/invited to test\s+(.+)/i);
        if (match) return match[1].trim();
        
        // Pattern 3: Look for "TestFlight" followed by app name
        match = subject.match(/TestFlight[:\s]+(.+)/i);
        if (match) return match[1].trim();
        
        // Pattern 4: Look for app name before "for iOS"
        match = subject.match(/(.+?)\s+for iOS/i);
        if (match) return match[1].trim();
        
        // Pattern 5: Extract from "By [Developer] ANASRE for iOS"
        match = subject.match(/By\s+(.+?)\s+ANASRE/i);
        if (match) return match[1].trim();
        
        // Pattern 6: Look in content for app names
        if (content) {
            match = content.match(/app-name['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (match) return match[1].trim();
            
            match = content.match(/application['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (match) return match[1].trim();
        }
        
        // Fallback: try to extract meaningful words from subject
        const cleanSubject = subject.replace(/TestFlight|invited|test|you|to|for|iOS|has|been/gi, '').trim();
        if (cleanSubject.length > 0 && cleanSubject.length < 50) {
            return cleanSubject;
        }
        
        return 'Unknown App';
    }
    extractTestFlightUrls(content) {
        if (!content) return [];

        const patterns = [
            // More aggressive patterns to capture complete URLs
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
                
                // Decode HTML entities
                url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                
                // Clean trailing punctuation but keep valid URL characters
                url = url.replace(/[.,;:!?)\]}>'"]+$/, '');
                
                // Validate URL - must be complete TestFlight URL
                if (url && 
                    url.includes('testflight.apple.com') && 
                    url.length > 50 && // TestFlight URLs are long
                    !url.endsWith('=') && // Remove truncated URLs
                    (url.includes('/v1/invite/') || url.includes('/join/')) &&
                    !url.includes('...') // Remove truncated URLs
                ) {
                    urls.add(url);
                }
            }
        });

        // Additional cleanup - remove URLs that are subsets of other URLs
        const urlArray = Array.from(urls);
        const cleanUrls = [];
        
        urlArray.forEach(url => {
            // Check if this URL is a truncated version of another URL
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

    // Process emails
    async processEmails() {
        return new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`📧 Inbox has ${box.messages.total} total messages`);

                // Get recent messages
                const recentCount = Math.min(50, box.messages.total);
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
                            // Parse the email
                            simpleParser(buffer)
                                .then(parsed => {
                                    const subject = parsed.subject || 'No Subject';
                                    console.log(`   📋 Subject: ${subject.substring(0, 50)}...`);

                                    // Get all content
                                    let allContent = '';
                                    if (parsed.html) allContent += parsed.html;
                                    if (parsed.text) allContent += parsed.text;
                                    
                                    // Also search raw content
                                    allContent += buffer;

                                    // Extract URLs
                                    const urls = this.extractTestFlightUrls(allContent);

                                    if (urls.length > 0) {
                                        console.log(`   🎉 Found ${urls.length} TestFlight URL(s)!`);
                                        
                                        urls.forEach(url => {
                                            // Try to extract app name from subject or content
                                            const appName = this.extractAppName(subject, allContent);
                                            foundUrls.push({
                                                url: url,
                                                appName: appName,
                                                subject: subject
                                            });
                                            console.log(`   📱 ${appName}: ${url}`);
                                        });
                                        emailsWithUrls++;
                                    } else if (allContent.toLowerCase().includes('testflight')) {
                                        console.log('   🔍 TestFlight email but no URLs found');
                                    } else {
                                        console.log('   ℹ️ Not a TestFlight email');
                                    }

                                    processedCount++;
                                })
                                .catch(parseErr => {
                                    console.log(`   ❌ Parse error: ${parseErr.message}`);
                                    
                                    // Try to extract from raw content anyway
                                    const urls = this.extractTestFlightUrls(buffer);
                                    if (urls.length > 0) {
                                        console.log(`   🎉 Found ${urls.length} URL(s) in raw content!`);
                                        urls.forEach(url => {
                                            const appName = this.extractAppName('Raw Email', buffer);
                                            foundUrls.push({
                                                url: url,
                                                appName: appName,
                                                subject: 'Raw Email'
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
                    // Wait a bit for all parsing to complete
                    setTimeout(() => {
                        console.log(`\n📊 Processing Summary:`);
                        console.log(`   📧 Emails processed: ${processedCount}`);
                        console.log(`   ✅ Emails with URLs: ${emailsWithUrls}`);
                        
                        resolve(foundUrls);
                    }, 2000);
                });
            });
        });
    }

    // Disconnect
    disconnect() {
        if (this.imap) {
            this.imap.end();
            console.log('🔌 Disconnected from iCloud');
        }
    }
}

async function RunTestFlightScrapper() {
    console.log('🍎 Node.js TestFlight URL Extractor');
    console.log('=' .repeat(40));
    console.log();

    const extractor = new TestFlightExtractor();

    try {
        // Get credentials
        const username = await extractor.getUserInput('📧 iCloud email: ');
        const password = await extractor.getPassword('🔐 App-specific password: ');

        // Connect
        const connected = await extractor.connect(username, password);
        if (!connected) {
            return;
        }

        // Process emails
        const urlData = await extractor.processEmails();

        // Group URLs by app name
        const appGroups = {};
        urlData.forEach(item => {
            // Validate URL first
            const url = item.url;
            if (url.length > 50 && 
                !url.endsWith('=') && 
                !url.includes('...') && 
                (url.includes('/v1/invite/') || url.includes('/join/')) &&
                url.match(/[A-Za-z0-9a-f]{8,}/)) {
                
                const appName = item.appName;
                if (!appGroups[appName]) {
                    appGroups[appName] = new Set();
                }
                appGroups[appName].add(url);
            }
        });

        // Convert to final format
        const totalValidUrls = Object.values(appGroups).reduce((sum, urls) => sum + urls.size, 0);

        // Show results
        console.log(`\n🎯 RESULTS:`);
        console.log(`🔗 Raw URLs found: ${urlData.length}`);
        console.log(`✅ Valid TestFlight URLs: ${totalValidUrls}`);
        console.log(`📱 Apps found: ${Object.keys(appGroups).length}`);

        if (totalValidUrls > 0) {
            console.log(`\n📱 TestFlight URLs by App:`);
            console.log('='.repeat(70));
            
            Object.keys(appGroups).sort().forEach(appName => {
                const urls = Array.from(appGroups[appName]);
                console.log(`\n🎮 ${appName} (${urls.length} URL${urls.length > 1 ? 's' : ''})`);
                urls.forEach(url => {
                    console.log(`   🔗 ${url}`);
                });
            });

            // Save to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                             new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const filename = `testflight_apps_${timestamp}.txt`;

            let content = 'TestFlight URLs by App\n' + '='.repeat(25) + '\n\n';
            Object.keys(appGroups).sort().forEach(appName => {
                const urls = Array.from(appGroups[appName]);
                content += `${appName} (${urls.length} URL${urls.length > 1 ? 's' : ''})\n`;
                content += '-'.repeat(appName.length + 10) + '\n';
                urls.forEach(url => {
                    content += `${url}\n`;
                });
                content += '\n';
            });

            fs.writeFileSync(filename, content, 'utf8');
            console.log(`\n💾 URLs saved to: ${filename}`);
            console.log(`🚀 Click these URLs to join TestFlight betas!`);
        } else {
            console.log('\n❌ No TestFlight URLs found');
            console.log('💡 Make sure you have TestFlight invitation emails in your inbox');
        }

    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
    } finally {
        extractor.disconnect();
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n⏹️ Cancelled by user');
    process.exit(0);
});


module.exports = {
  RunTestFlightScrapper
}