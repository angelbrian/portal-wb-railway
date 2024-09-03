const axios = require('axios');

const QB_TOKEN = process.env.QB_TOKEN;
const HEADERS_QB = {
    'Content-Type': 'application/json',
    'QB-Realm-Hostname': 'jesuscortez.quickbase.com',
    'Authorization': `QB-USER-TOKEN ${ QB_TOKEN }`,
}

const getDataVisor = async ( { tableId, reportId, fieldSort, fieldMonth, fieldValue, } ) => {

    const body = {
        tableId
    }

    const dataReport = await axios.post(`https://api.quickbase.com/v1/reports/${ reportId }/run`, {}, {
        headers: HEADERS_QB,
        params: {
            ...body
        },
    });

    const { fields, metadata, data } = dataReport.data;

    let months = [];

    const dateCurrent = new Date();
    const currentYear = dateCurrent.getFullYear();
    const currentMonth = dateCurrent.getMonth();

    for (let index = 0; index < currentMonth; index++) {
        const date = new Date(currentYear, index);
        const monthDate = date.toLocaleString('default', { month: 'long' });
        const monthFormat = monthDate.substring(0, 3).toUpperCase();
        months = [
        ...months,
        `${ monthFormat } ${ currentYear }`
        ];
    }

    let dataKeysTemp = {};

    data.forEach(d => {

        const newValue = d[fieldSort]['value'];
        
        dataKeysTemp = {
        // [`${ newValue.replace(/[+-]/g, '').trim() }`]: newValue,
        [newValue]: {
            tempValue: `${ newValue.replace(/[+-]/g, '').trim() }`,
            newValue,
        },
        ...dataKeysTemp,
        }

    });

    
    const keys = Object.entries( dataKeysTemp ).
        sort( ( a, b ) => a[1]['tempValue'].localeCompare(b[1]['tempValue']) ).
        map( v => v[1]['newValue'] );

    let dataDepurate = {};

    keys.forEach(key => {
        
        months.forEach(month => {
        
        const asignValue = data.filter( value => ( 
            value[fieldMonth]['value'] ===  month &&
            value[fieldSort]['value'] ===  key
        )).map( value => (
            value[fieldValue]['value']
        ))[0];

        dataDepurate = {
            ...dataDepurate,
            [key]: {
            ...dataDepurate[key],
            [month]: asignValue,
            }
        };

        });
        
    });

    return {
        dataDepurate, 
        months, 
        keys
    };

};

module.exports = {
    getDataVisor,
};