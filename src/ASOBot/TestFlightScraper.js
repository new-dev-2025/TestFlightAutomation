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
        let appName = null;
        let developerName = null;

        if (content) {
            const htmlPatterns = [
                /<span[^>]*style="[^"]*font-family:[^"]*apple-system[^"]*"[^>]*>([^<]+)<\/span>/i,
                /<div[^>]*style="[^"]*font-family:[^"]*apple-system[^"]*"[^>]*>([^<]+)<\/div>\s*<div[^>]*>By\s+[^<]+\s+for\s+iOS/i,
                /alt="([^,]+),\s*app\s+icon"/i,
                /aria-label="([^"]+?)\s+for\s+iOS"/i,
                /<h2[^>]*aria-label="([^"]+?)\s+for\s+iOS"/i,
                /<[^>]*style="[^"]*font-size:\s*24px[^"]*"[^>]*>([^<]+)<\/[^>]*>/i,
                /app-name['"]\s*:\s*['"]([^'"]+)['"]/i,
                /application['"]\s*:\s*['"]([^'"]+)['"]/i,
                /<title[^>]*>([^<]+TestFlight[^<]*)<\/title>/i,
                /You're invited to test\s+([^.]+)/i,
                /To test this app,.*?([A-Za-z][A-Za-z0-9\s]{2,30}),\s*you agree/i,
                /By using\s+([A-Za-z][A-Za-z0-9\s]{2,30}),\s*you agree/i,
            ];

            for (const pattern of htmlPatterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                    let extractedName = match[1].trim();
                    
                    extractedName = extractedName.replace(/\b(TestFlight|invited|test|you|to|has|been|the|beta|join)\b/gi, '').trim();
                    extractedName = extractedName.replace(/\s+for\s+iOS$/i, '').trim();
                    
                    if (extractedName.length > 0 && extractedName.length < 100 && /[A-Za-z]/.test(extractedName)) {
                        extractedName = extractedName.replace(/&[a-zA-Z0-9#]+;/g, '');
                        appName = extractedName;
                        break;
                    }
                }
            }

            const developerPatterns = [
                /By\s+([A-Za-z][A-Za-z0-9\s]{2,50}?)\s+for\s+iOS/i,
                /By\s+([A-Za-z][A-Za-z0-9\s]{2,50}?)\s+(?:ANASRE|Inc|LLC|Ltd|Corporation|Co\.)/i,
                /By\s+([A-Za-z][A-Za-z0-9\s]{2,50}?)(?:\s|<|$)/i,
            ];

            for (const pattern of developerPatterns) {
                const match = content.match(pattern);
                if (match && match[1]) {
                    let extractedDev = match[1].trim();
                    extractedDev = extractedDev.replace(/\b(for|iOS|the|and|&)\b/gi, '').trim();
                    if (extractedDev.length > 0 && extractedDev.length < 50) {
                        developerName = extractedDev;
                        break;
                    }
                }
            }
        }

        if (!appName) {
            const subjectPatterns = [
                /(.+?)\s+has invited you to test/i,
                /invited to test\s+(.+?)(?:\s+on\s+TestFlight)?$/i,
                /TestFlight[:\s]+(.+?)(?:\s+for\s+iOS)?$/i,
                /(.+?)\s+for iOS/i,
                /Join the\s+(.+?)\s+beta/i,
                /(.+?)\s*-\s*TestFlight/i,
                /Start testing\s+(.+)/i,
                /(.+?)\s+is ready for beta testing/i,
            ];

            for (const pattern of subjectPatterns) {
                const match = subject.match(pattern);
                if (match && match[1]) {
                    let extractedName = match[1].trim();
                    extractedName = extractedName.replace(/\b(TestFlight|invited|test|you|to|for|iOS|has|been|the|beta|join)\b/gi, '').trim();
                    if (extractedName.length > 0 && extractedName.length < 100 && /[A-Za-z]/.test(extractedName)) {
                        appName = extractedName;
                        break;
                    }
                }
            }
        }

        if (developerName && appName) {
            if (!appName.toLowerCase().includes(developerName.toLowerCase())) {
                return `${developerName} + ${appName}`;
            } else {
                return appName;
            }
        }

        if (developerName && !appName) {
            return `${developerName} + App`;
        }

        if (appName) {
            return appName;
        }

        let cleanSubject = subject
            .replace(/\b(TestFlight|invited|test|you|to|for|iOS|has|been|join|beta|start|testing)\b/gi, '')
            .replace(/[^\w\s-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleanSubject.length > 0 && cleanSubject.length < 100 && /[A-Za-z]/.test(cleanSubject)) {
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
            /(https%3A%2F%2Ftestflight\.apple\.com%2Fv1%2Finvite%2F[A-Za-z0-9a-f%]+)/gi,
            /(https%3A%2F%2Ftestflight\.apple\.com%2Fjoin%2F[A-Za-z0-9%]+)/gi,
            /(testflight\.apple\.com\/v1\/invite\/[A-Za-z0-9a-f]+[^\s<>"'\)]*)/gi,
            /(testflight\.apple\.com\/join\/[A-Za-z0-9]+[^\s<>"'\)]*)/gi,
        ];

        const urls = new Set();

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                let url = match[1] || match[0];
                
                url = decodeURIComponent(url);
                
                url = url.replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"');
                
                if (!url.startsWith('http')) {
                    url = 'https://' + url;
                }
                
                url = url.replace(/[.,;:!?)\]}>'"]+$/, '');
                
                if (this.isValidTestFlightUrl(url)) {
                    urls.add(url);
                }
            }
        });

        return Array.from(urls);
    }

    isValidTestFlightUrl(url) {
        if (!url || !url.includes('testflight.apple.com')) return false;
        
        if (!url.includes('/v1/invite/') && !url.includes('/join/')) return false;
        
        if (url.length < 50) return false;
        
        if (url.endsWith('=') || url.includes('...')) return false;
        
        const hasValidCode = url.match(/[A-Za-z0-9a-f]{8,}/);
        if (!hasValidCode) return false;
        
        return true;
    }

    async processEmails() {
        return new Promise((resolve, reject) => {
            this.imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(err);
                    return;
                }

                console.log(`📧 Inbox has ${box.messages.total} total messages`);

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
                const totalEmails = end - start + 1;

                f.on('message', (msg, seqno) => {
                    console.log(`📧 Processing email ${processedCount + 1}/${totalEmails}...`);

                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });

                        stream.on('end', () => {
                            simpleParser(buffer)
                                .then(parsed => {
                                    const subject = parsed.subject || 'No Subject';
                                    
                                    if (this.isTestFlightEmail(subject, buffer)) {
                                        console.log(`   📋 TestFlight: ${subject.substring(0, 60)}...`);

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
                                                    subject: subject,
                                                    date: parsed.date
                                                });
                                                console.log(`   📱 ${appName}: ${url.substring(0, 80)}...`);
                                            });
                                            emailsWithUrls++;
                                        } else {
                                            console.log('   🔍 TestFlight email but no valid URLs found');
                                        }
                                    } else {
                                        console.log(`   ⏭️  Skipping non-TestFlight email`);
                                    }

                                    processedCount++;
                                })
                                .catch(parseErr => {
                                    console.log(`   ❌ Parse error: ${parseErr.message}`);
                                    
                                    if (this.isTestFlightEmail('', buffer)) {
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
                        console.log(`   ✅ TestFlight emails with URLs: ${emailsWithUrls}`);
                        
                        resolve(foundUrls);
                    }, 3000);
                });
            });
        });
    }

    isTestFlightEmail(subject, content) {
        const testFlightKeywords = [
            'testflight',
            'test flight',
            'invited to test',
            'join the beta',
            'beta test',
            'app store connect',
            'testflight.apple.com'
        ];

        const text = (subject + ' ' + content).toLowerCase();
        return testFlightKeywords.some(keyword => text.includes(keyword));
    }

    disconnect() {
        if (this.imap) {
            this.imap.end();
            console.log('🔌 Disconnected from iCloud');
        }
    }
}

async function RunTestFlightScrapper() {
    console.log('🍎 Enhanced TestFlight URL Extractor');
    console.log('=' .repeat(50));
    
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
            const appName = item.appName;
            
            if (!appGroups[appName]) {
                appGroups[appName] = {
                    urls: new Set(),
                    subjects: new Set(),
                    dates: []
                };
            }
            
            appGroups[appName].urls.add(url);
            appGroups[appName].subjects.add(item.subject);
            appGroups[appName].dates.push(item.date);
        });

        const totalValidUrls = Object.values(appGroups).reduce((sum, group) => sum + group.urls.size, 0);

        console.log(`\n🎯 FINAL RESULTS:`);
        console.log(`🔗 Total URLs found: ${urlData.length}`);
        console.log(`✅ Unique TestFlight URLs: ${totalValidUrls}`);
        console.log(`📱 Apps discovered: ${Object.keys(appGroups).length}`);

        if (totalValidUrls > 0) {
            console.log(`\n📱 TestFlight URLs Grouped by App:`);
            console.log('='.repeat(80));
            
            Object.keys(appGroups).sort().forEach(appName => {
                const group = appGroups[appName];
                const urls = Array.from(group.urls);
                const subjects = Array.from(group.subjects);
                
                console.log(`\n🎮 ${appName}`);
                console.log(`   📊 URLs: ${urls.length} | Emails: ${subjects.length}`);
                console.log(`   📅 Latest: ${Math.max(...group.dates.map(d => new Date(d).getTime()))}`);
                
                urls.forEach((url) => {
                    console.log(`   🔗 ${url}`);
                });
            });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                             new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            const filename = `testflight_apps_${timestamp}.txt`;

            let content = `TestFlight URLs Grouped by App\n`;
            content += `Generated: ${new Date().toLocaleString()}\n`;
            content += `Total Apps: ${Object.keys(appGroups).length}\n`;
            content += `Total URLs: ${totalValidUrls}\n`;
            content += '='.repeat(50) + '\n\n';
            
            Object.keys(appGroups).sort().forEach(appName => {
                const group = appGroups[appName];
                const urls = Array.from(group.urls);
                
                content += `${appName}\n`;
                content += `-`.repeat(Math.min(appName.length, 50)) + '\n';
                content += `URLs: ${urls.length}\n`;
                urls.forEach((url) => {
                     content += `${url}\n`;
                });
                content += '\n';
            });

            fs.writeFileSync(filename, content, 'utf8');
            console.log(`\n💾 Results saved to: ${filename}`);
            console.log(`🚀 Click any URL above to join TestFlight betas!`);
            
        } else {
            console.log('\n❌ No TestFlight URLs found');
            console.log('💡 Tips:');
            console.log('   - Check if you have TestFlight invitation emails');
            console.log('   - Try increasing the email count in the code');
            console.log('   - Check your email filters/spam folder');
        }

    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        console.log('💡 Check your internet connection and credentials');
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
};