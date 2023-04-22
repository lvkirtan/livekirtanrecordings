import { PdfReader } from 'pdfreader';
import axios from 'axios'
const url = 'http://old.sgpc.net/Ragi%20List_Eng.pdf';
import fs from 'fs'


const getRagiList = async () => {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer'
  });
  //return fs.readFileSync('xyz7.pdf')
  return response.data
}

function extractTables(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let currentRow = null;
    let currentTable = null;

    new PdfReader().parseBuffer(pdfBuffer, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        // End of file
        if (currentTable) {
          rows.push(currentTable);
        }
        resolve(rows);
      } else if (item.text) {
        // Text item
        if (item.y === currentRow) {
          // Same row as previous item
          currentTable[currentTable.length - 1].text += ' ' + item.text;
        } else {
          // New row
          if (currentTable) {
            rows.push(currentTable);
          }
          currentRow = item.y;
          currentTable = [{ text: item.text }];
        }
      } else if (item.x === 0) {
        // Table item
        currentTable = null;
      }
    });
  });
}

const convertRagiListToJson = async () => {
  const getRagiListBuffer = await getRagiList();
  return extractTables(getRagiListBuffer).then(tables => {
    tables = tables.map((arr) => {
      if (arr[0].text.includes('Bhai'))
        return [{
          text:
            arr[0].text.split('Bhai').map((data) => data.split('Singh').map((data) => data.replace(/\s+/g, '')).join(" Singh ")).join(' Bhai ') //clearing empty spaces in ragi name data as conversion has some garbage spaces so removing and purifying
        }]
      return arr
    })
    const ragisArray = getRagisArrayFromTable(tables)
    // fs.writeFileSync('ragi.json', JSON.stringify(tables));
    const singleString = convertSubTextsFromJsonToSingleString(tables)
    const timingsArrayGroupedByTable = generateKeertanTimingsArray(singleString);
    const duties = populateRagisToTimingsArray(ragisArray, timingsArrayGroupedByTable, singleString);
    return new Promise((res, rej) => {
      fs.writeFile('ragiList.json', JSON.stringify(duties), (err, data) => {
        if (err)
          return rej('error in writing list')
        res('successfully updated ragiList.json')
      })
    })
  }).catch(err => {
    return Promise.reject(err)
  });
}

const convertSubTextsFromJsonToSingleString = (tables) => {
  return tables.reduce((convertedSingleString, obj) => {
    convertedSingleString += obj[0].text;
    return convertedSingleString;
  }, '')
}

const generateListValidity = singleString => {
  const matchedResult = singleString.match(/(\d{1} *?\d{1}-\d{1} *?\d{1}-\d{4,5}).*?to.*?((\d{1} *?\d{1}-\d{1} *?\d{1}-\d{4,5}))/mi);
  if (!matchedResult)
    throw new Error('Failed generating list validity of ragi list ')
  return { from: matchedResult[1].replace(/\s+/g, ''), to: matchedResult[2].replace(/\s+/g, '') }
}
const generateKeertanTimingsArray = (str) => {
  str = removeDateEntriesFromString(str) //as encountring bug if date also exist as for eg 02-11 is same as 02-11-23 as it pick up 02-11 from date and counclude -23 part as * but i don't want this behaviour
  const regexToGroupMultipleTableEntries = /\d{1}\s{18}\d(.+?)(?=\d{1}\s{18}\d|$)/gm //the regex returns all the data after 1              2            3                 4(which is named group 1 by me as it is first table)in its first index  uptill it encounters 5              6             7(which is named group2 by me)and all the data after 5      6         7... in second index  in the form of array
  const timingsArrayGroupedByTable = str.match(regexToGroupMultipleTableEntries).reduce((p, c, index) => ({ ...p, [`Group-${index + 1}`]: generateTimingsArrayFromString(c) }), {}) //it generates all the timings in groups which are  generated by me in previous line
  return timingsArrayGroupedByTable
}

const getRagisArrayFromTable = (tables) => {
  return tables.reduce((p, arr) => {
    if (arr[0].text.includes('Bhai')) {

      return [...p, ...arr[0].text.split('Bhai').filter((data) => !(data == ' ' || data == '  ') && data.includes('Singh')).map((data) => 'Bhai' + data)]
    }
    return p;
  }, [])
}

function removeDateEntriesFromString(inputString) {
  // Define the regular expression pattern to match dates in the format DD-MM-YYYY or DD-MM-YY
  var regexPattern = /(\d{2}|\d{1})-\d{2}-(\d{4}|\d{2})/g; //to match for pattern DD-MM-YYYY or DD-MM-YY
  // Replace all occurrences of dates with empty quotes
  var outputString = inputString.replace(regexPattern, '');
  // Return the modified string
  return outputString;
}

const generateTimingsArrayFromString = (str) => {
  const regexToDetectTimeInFormat_HH_MM = /(\d{1,2}-\d{2}).*?to.*?((\d{1,2}-\d{2}(?:.*?Morning)?)|till Completion)/gm;   //ye regex tbhi bhi same result deta agr \d{2}-\d{2} isko () m wrap na krte ,wrap krne se ye hoga ki jo niche regex.exec chalaya h wo matched result m agr () wali entries h to use apne result roopi array m position 1 for first occurence of () and position second for second occurence of () and so on.. jisse mera logic optimize hora tha ,or dusre tareke h but ye optimized laga isliye  kiya  use
  const timingsArray = [];
  let match;
  while (match = regexToDetectTimeInFormat_HH_MM.exec(str)) {     //regex.match hota h jo sare timingsArray array m return krta h pr exec kya krta h jb chlta h to single match return krta h agr dubara chalaenge to uske age se match krega jo already match ho chuka tha usko skip krke 
    timingsArray.push(
      match[2].includes('Morning')
        ? `${match[1]} to ${match[2]}`.replace(/(\s+|Morning)/g, '')
        : `${parseInt(match[1].split('-')[0]) === 12 ? 12 : parseInt(match[1].split('-')[0]) + 12}-${match[1].split('-')[1]} to ${match[2].includes('till Completion') ? 'till Completion' : `${parseInt(match[2].split('-')[0]) === 12 ? 12 : parseInt(match[2].split('-')[0]) + 12}-${match[2].split('-')[1]}`}`);
  }
  return timingsArray
}

const populateRagisToTimingsArray = (ragisArray, timingsArrayGroupedByTable, singleString) => {

  const listValidity = generateListValidity(singleString);
  const [fromDay, fromMonth, fromYear] = listValidity.from.split('-'); // ye isliye krna padha kyuki meri date DD-MM-YYYY m h and js ki Date ka format MM-DD-YYYY hota h 
  const [toDay, toMonth, toYear] = listValidity.to.split('-');
  const duties = {}
  const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
  const toDate = new Date(toYear, toMonth - 1, toDay);
  const dayInMillis = 24 * 60 * 60 * 1000; // One day in milliseconds

  let ragisArrayCurrentIndexForGroup1 = 0;
  let totalDays = Math.floor((toDate - fromDate) / dayInMillis) + 1
  let ragisArrayCurrentIndexForGroup2 = totalDays * (parseInt(timingsArrayGroupedByTable['Group-1'].length / 2) + 1)
  for (let date = fromDate; date <= toDate; date.setDate(date.getDate() + 1)) {

    let ragisArrayPopulationStartIndexForGroup1 = ragisArrayCurrentIndexForGroup1;
    let ragisArrayPopulationStartIndexForGroup2 = ragisArrayCurrentIndexForGroup2;

    const group1Data = timingsArrayGroupedByTable['Group-1'].reduce((p, c, index, arr) => {
      if (index === parseInt(arr.length / 2) + 1) //for repetition of same ragi to multiple times in table
        ragisArrayCurrentIndexForGroup1 = ragisArrayPopulationStartIndexForGroup1
      if (index === parseInt(arr.length / 2) + 2) //condition for skipping multiple time entry of ragi in case of Asa Ki Vaar
        ragisArrayCurrentIndexForGroup1 += 1;
      let dutyObj = { from: c.split('to')[0], to: c.split('to')[1], duty: ragisArray[ragisArrayCurrentIndexForGroup1] }
      ragisArrayCurrentIndexForGroup1 += 1;
      return [...p, dutyObj]
    }, [])

    const group2Data = timingsArrayGroupedByTable['Group-2'].reduce((p, c, index, arr) => {
      if (index === parseInt(arr.length / 2)) //for repetition of same ragi to multiple times in table
        ragisArrayCurrentIndexForGroup2 = ragisArrayPopulationStartIndexForGroup2
      let dutyObj = { from: c.split('to')[0], to: c.split('to')[1], duty: ragisArray[ragisArrayCurrentIndexForGroup2] }
      ragisArrayCurrentIndexForGroup2 += 1;
      return [...p, dutyObj]
    }, [])
    duties[date.toLocaleDateString('en-GB')] = [...group1Data, ...group2Data];
  }
  // console.log(duties)
  return duties;
}

export const createUpdateRagiList = () => convertRagiListToJson();
