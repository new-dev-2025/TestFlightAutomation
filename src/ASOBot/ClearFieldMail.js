// // // remove_failed_accounts.js
// // const fs = require('fs');
// // const path = require('path');

// // const failedEmails = [
// //   "YarabgEtebvq4207@icloud.com",
// //   "AmrqoElbazrc4563@icloud.com",
// //   "YouftzYounesqv4012@icloud.com",
// //   "KhaedpmHezyam6634@icloud.com",
// //   "HebatnBaratzn6651@icloud.com",
// //   "AmirajgFahmyuo2407@icloud.com",
// //   "MennadsHasneq7855@icloud.com",
// //   "SamryuRadivc9716@icloud.com",
// //   "LinarvTaiklj0557@icloud.com",
// //   "SadyplHillma4482@icloud.com",
// //   "FarahxbElndywd0501@icloud.com",
// //   "MayarhdArafavy1515@icloud.com",
// //   "YasnuvGhimts8347@icloud.com",
// //   "BasmczAhmedbt6585@icloud.com",
// //   "DinazsRaeimn3890@icloud.com",
// //   "WaelfgGaberyu1718@icloud.com",
// //   "HagrtyFahmyuo6938@icloud.com",
// //   "RamipcRaeimn8150@icloud.com",
// //   "ShefblAdlyqu0214@icloud.com",
// //   "NourwlKamelrd8528@icloud.com",
// //   "NadayoSheajg5796@icloud.com",
// //   "MoedtcMekyen9382@icloud.com",
// //   "NaderxuAttiahl0348@icloud.com",
// //   "SamihpSelimxo0618@icloud.com",
// //   "MoedtcSelimxo9911@icloud.com",
// //   "AymanxqKamelrd1965@icloud.com",
// //   "JudywnQassjo8217@icloud.com",
// //   "AleiqxElbazrc6681@icloud.com",
// //   "MostamhShahz3215@icloud.com",
// //   "FarahxbElzlynk2437@icloud.com",
// //   "LinarvHamdycs1786@icloud.com",
// //   "WaelfgBadrfk6934@icloud.com",
// //   "EsrqlMoulytr8998@icloud.com",
// //   "AdelkuSheajg5995@icloud.com",
// //   "YomnazvTanwyns2979@icloud.com",
// //   "HagrtyMekyen2274@icloud.com",
// //   "GhaassElbazrc5504@icloud.com",
// //   "JudywnGaberyu7295@icloud.com",
// //   "MayarhdEtebvq8992@icloud.com",
// //   "NourwlElzlynk2120@icloud.com",
// //   "LailamcMousp9469@icloud.com",
// //   "HagrtyRagaxs3070@icloud.com",
// //   "SamihpElzlynk9809@icloud.com",
// //   "AymanxqLotfydq2298@icloud.com",
// //   "KamvxMoulytr2061@icloud.com",
// //   "MennadsAmerws9347@icloud.com",
// //   "SadyplAdlyqu6349@icloud.com",
// //   "KhaedpmRagaxs8825@icloud.com",
// //   "JudywnAshfed3190@icloud.com",
// //   "ReemjiElmytp8468@icloud.com",
// //   "AymanxqEtebvq6142@icloud.com",
// //   "JudywnHoamgf9512@icloud.com",
// //   "RaniayoElbazrc9254@icloud.com",
// //   "IbrmclElzlynk2674@icloud.com",
// //   "AymanxqAmerws3688@icloud.com"
// // ];

// // function removeFailedAccounts(filePath) {
// //   if (!fs.existsSync(filePath)) {
// //     console.log(`File not found: ${filePath}`);
// //     return;
// //   }
// //   const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
// //   const filtered = data.filter(acc => !failedEmails.includes(acc.email));
// //   fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
// //   console.log(`Updated: ${filePath} (${data.length - filtered.length} removed)`);
// // }

// // removeFailedAccounts(path.join(__dirname, '../data/Account.json'));
// // removeFailedAccounts(path.join(__dirname, '../data/AppleID.json'));

// const fs = require('fs');
// const path = require('path');

// const accountPath = path.join(__dirname, '../data/Account.json');
// const appleIdPath = path.join(__dirname, '../data/AppleID.json');

// const accounts = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
// const appleIds = JSON.parse(fs.readFileSync(appleIdPath, 'utf8'));

// const keyMap = {};
// accounts.forEach(acc => {
//   keyMap[acc.email] = acc.privateKey;
// });

// const merged = appleIds.map(item => {
//   if (keyMap[item.email]) {
//     return { ...item, privateKey: keyMap[item.email] };
//   }
//   return item;
// });

// fs.writeFileSync(appleIdPath, JSON.stringify(merged, null, 2));
// console.log('AppleID.json updated with privateKey from Account.json');