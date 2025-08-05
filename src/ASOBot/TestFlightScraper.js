const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');

class TestFlightExtractor {
    constructor() {
        this.imap = null;
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

    extractAppName(subject, content) {
        let match = subject.match(/(.+?)\s+has invited you to test/i);
        if (match) return match[1].trim();

        match = subject.match(/invited to test\s+(.+)/i);
        if (match) return match[1].trim();
        
        match = subject.match(/TestFlight[:\s]+(.+)/i);
        if (match) return match[1].trim();
        match = subject.match(/(.+?)\s+for iOS/i);
        if (match) return match[1].trim();

        match = subject.match(/By\s+(.+?)\s+ANASRE/i);
        if (match) return match[1].trim();
        if (content) {
            match = content.match(/app-name['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (match) return match[1].trim();
            
            match = content.match(/application['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (match) return match[1].trim();
        }

        const cleanSubject = subject.replace(/TestFlight|invited|test|you|to|for|iOS|has|been/gi, '').trim();
        if (cleanSubject.length > 0 && cleanSubject.length < 50) {
            return cleanSubject;
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
                url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                url = url.replace(/[.,;:!?)\]}>'"]+$/, '');
                if (url && 
                    url.includes('testflight.apple.com') && 
                    url.length > 50 &&
                    !url.endsWith('=') &&
                    (url.includes('/v1/invite/') || url.includes('/join/')) &&
                    !url.includes('...')
                ) {
                    urls.add(url);
                }
            }
        });

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
                            simpleParser(buffer)
                                .then(parsed => {
                                    const subject = parsed.subject || 'No Subject';
                                    console.log(`   📋 Subject: ${subject.substring(0, 50)}...`);

                                    let allContent = '';
                                    if (parsed.html) allContent += parsed.html;
                                    if (parsed.text) allContent += parsed.text;
                                    
                                    allContent += buffer;

                                    const urls = this.extractTestFlightUrls(allContent);

                                    if (urls.length > 0) {
                                        console.log(`   🎉 Found ${urls.length} TestFlight URL(s)!`);
                                        
                                        urls.forEach(url => {
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
        const username = await extractor.getUserInput('📧 iCloud email: ');
        const password = await extractor.getPassword('🔐 App-specific password: ');

        const connected = await extractor.connect(username, password);
        if (!connected) {
            return;
        }

        const urlData = await extractor.processEmails();

        const appGroups = {};
        urlData.forEach(item => {
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

        const totalValidUrls = Object.values(appGroups).reduce((sum, urls) => sum + urls.size, 0);

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

process.on('SIGINT', () => {
    console.log('\n⏹️ Cancelled by user');
    process.exit(0);
});

module.exports = {
  RunTestFlightScrapper
}
