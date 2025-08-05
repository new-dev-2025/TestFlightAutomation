require('dotenv').config();

function getApiSmsUrl() {
   return process.env.API_SMS;
}

module.exports = {
    getApiSmsUrl
}