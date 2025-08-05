const fs = require('fs'); 

function getUrlsFromFile(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const urls = fileContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('http'));
        return urls;
    } catch (error) {
        console.error('Error reading file:', error.message);
        return [];
    }
}

function loadActivationLinks(fileName) {
    console.log('Loading activation links...');
    const links = getUrlsFromFile(fileName);
    
    if (links.length === 0) {
        console.log('No activation links found.');
        return [];
    }
    return links;
}

module.exports = { loadActivationLinks }