const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '../web/data/live_buildings.json');
const blds = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const types = {};
let publicCount = 0;
let privateCount = 0;
const owners = {};

blds.forEach(b => {
    types[b.type] = (types[b.type] || 0) + 1;
    if (b.is_public) publicCount++;
    else privateCount++;
    if (b.owner_name) {
        owners[b.owner_name] = (owners[b.owner_name] || 0) + 1;
    }
});

console.log('Total buildings in live_buildings.json:', blds.length);
console.log('Public:', publicCount, 'Private:', privateCount);
console.log('Breakdown by type:', types);
console.log('Unique owners count:', Object.keys(owners).length);
console.log('Sample owners:', Object.keys(owners).slice(0, 10));

