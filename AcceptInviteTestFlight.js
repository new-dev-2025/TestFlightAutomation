const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const readline = require('readline');

class AppStoreActivationExtractor {
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
        return new Promise((resolve) => {
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

    extractActivationLinks(content) {
        if (!content) return [];

        const urls = new Set();

        // Decode HTML entities
        const decodeHtml = (html) => {
            return html
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&nbsp;/g, ' ');
        };

        const decodedContent = decodeHtml(content);

        // FOCUSED PATTERN: Only look for activation_ds links with key parameter
        const activationPatterns = [
            // Pattern 1: activation_ds with key parameter (your example format)
            /https:\/\/appstoreconnect\.apple\.com\/activation_ds\?key=[a-f0-9]{32}/gi,
            
            // Pattern 2: activation_ds with key parameter in HTML links
            /<a[^>]+href=["'](https:\/\/appstoreconnect\.apple\.com\/activation_ds\?key=[a-f0-9]{32})["'][^>]*>/gi,
            
            // Pattern 3: More flexible key format (in case keys vary in length/format)
            /https:\/\/appstoreconnect\.apple\.com\/activation_ds\?key=[a-f0-9]+/gi,
            
            // Pattern 4: URL encoded versions
            /https:\/\/appstoreconnect\.apple\.com\/activation_ds\?key%3D[a-f0-9]+/gi,
        ];

        // Apply activation patterns
        for (const pattern of activationPatterns) {
            let match;
            while ((match = pattern.exec(decodedContent)) !== null) {
                let url;
                if (match[1]) {
                    // From HTML href attribute
                    url = decodeHtml(match[1]);
                } else {
                    // Direct URL match
                    url = decodeHtml(match[0]);
                }
                
                // Clean up URL encoding
                url = url.replace(/key%3D/g, 'key=');
                urls.add(url);
            }
        }

        // Also search for the pattern across line breaks (in case URLs are wrapped)
        const lines = decodedContent.replace(/[\r\n\s]+/g, ' ').split(' ');
        for (const line of lines) {
            if (line.includes('appstoreconnect.apple.com/activation_ds')) {
                const match = line.match(/https:\/\/appstoreconnect\.apple\.com\/activation_ds\?key=[a-f0-9]+/i);
                if (match) {
                    urls.add(match[0]);
                }
            }
        }

        return Array.from(urls);
    }

    async processEmails() {
        return new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`📧 Inbox has ${box.messages.total} total messages`);

                // Check more emails to find activation links
                const recentCount = Math.min(300, box.messages.total);
                const start = Math.max(1, box.messages.total - recentCount + 1);
                const end = box.messages.total;

                console.log(`🔍 Searching for activation_ds links in last ${recentCount} emails...`);

                const f = this.imap.seq.fetch(`${start}:${end}`, {
                    bodies: '',
                    struct: true
                });

                const foundUrls = [];
                let processedCount = 0;
                const totalToProcess = end - start + 1;

                f.on('message', (msg, seqno) => {
                    if (seqno % 10 === 0) {
                        console.log(`📧 Processing email ${seqno}/${end}...`);
                    }

                    msg.on('body', (stream) => {
                        let buffer = '';

                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });

                        stream.on('end', () => {
                            simpleParser(buffer)
                                .then(parsed => {
                                    const subject = parsed.subject || 'No Subject';

                                    let content = '';
                                    if (parsed.html) content += parsed.html;
                                    if (parsed.text) content += parsed.text;
                                    content += buffer;

                                    const urls = this.extractActivationLinks(content);

                                    if (urls.length > 0) {
                                        urls.forEach(url => {
                                            foundUrls.push({
                                                url: url,
                                                subject: subject,
                                                from: parsed.from ? parsed.from.text : 'Unknown',
                                                date: parsed.date || 'Unknown'
                                            });
                                            console.log(`✅ Found: ${url}`);
                                        });
                                    }

                                    processedCount++;
                                })
                                .catch((parseError) => {
                                    processedCount++;
                                });
                        });
                    });
                });

                f.once('error', (err) => {
                    reject(err);
                });

                f.once('end', () => {
                    const checkComplete = () => {
                        if (processedCount >= totalToProcess) {
                            console.log(`\n📊 Search Complete:`);
                            console.log(`   Emails Processed: ${processedCount}`);
                            console.log(`   Activation Links Found: ${foundUrls.length}`);
                            resolve(foundUrls);
                        } else {
                            setTimeout(checkComplete, 500);
                        }
                    };
                    
                    setTimeout(checkComplete, 2000);
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

// Main runner
async function main() {
    console.log('🎯 App Store Connect Activation Link Extractor');
    console.log('   Target: https://appstoreconnect.apple.com/activation_ds?key=...');
    console.log('='.repeat(65));
    console.log();

    const extractor = new AppStoreActivationExtractor();

    try {
        const username = await extractor.getUserInput('📧 iCloud email: ');
        const password = await extractor.getPassword('🔐 App-specific password: ');

        const connected = await extractor.connect(username, password);
        if (!connected) return;

        const urlData = await extractor.processEmails();

        if (urlData.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                              new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const filename = `ActivationLinks_${timestamp}.txt`;

            // Save only the links to file
            let content = '';
            urlData.forEach((item) => {
                content += `${item.url}\n`;
            });

            fs.writeFileSync(filename, content, 'utf8');
            console.log(`\n💾 Links saved to: ${filename}`);
            
            // Display only the links
            console.log('\n🔗 Found Links:');
            urlData.forEach((item) => {
                console.log(item.url);
            });
            
        } else {
            console.log('\n❌ No activation_ds links found');
            console.log('\n💡 Troubleshooting:');
            console.log('   • Make sure invitation emails are in your INBOX');
            console.log('   • Check if emails are in a different folder (Promotions, etc.)');
            console.log('   • Verify you\'re using the correct iCloud account');
            console.log('   • The script checks the last 300 emails');
            console.log('   • Links might have expired or been used already');
        }

    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        if (error.message.includes('AUTHENTICATIONFAILED')) {
            console.log('\n💡 Authentication Help:');
            console.log('   1. Go to https://appleid.apple.com/account/manage');
            console.log('   2. Sign in with your Apple ID');
            console.log('   3. Generate an App-Specific Password');
            console.log('   4. Use that password (not your regular iCloud password)');
        }
    } finally {
        extractor.disconnect();
    }
}

process.on('SIGINT', () => {
    console.log('\n⏹️ Cancelled by user');
    process.exit(0);
});

if (require.main === module) {
    main();
}