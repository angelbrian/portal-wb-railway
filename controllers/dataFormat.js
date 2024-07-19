//const data = require('./Enero.xlsx.json');

const formatMonth = ( name ) => {
    let month = '';
    switch (name) {
        case 'Ene':
            month = 'Enero';
            break;
        case 'Feb':
            month = 'Febrero';
        break;
        case 'Mar':
            month = 'Marzo';
        break;
        case 'Abr':
            month = 'Abril';
        break;
        case 'May':
            month = 'Mayo';
        break;
        case 'Jun':
            month = 'Junio';
        break;
        case 'Jul':
            month = 'Julio';
        break;
        case 'Ago':
            month = 'Agosto';
        break;
        case 'Sep':
            month = 'Septiembre';
        break;
        case 'Oct':
            month = 'Octubre';
        break;
        case 'Nov':
            month = 'Noviembre';
        break;
        case 'Dic':
            month = 'Diciembre';
        break;
        default:
            month = '---';
        break;
    }
    return month;
}

const formatDate = ( date ) => {
    const formatDate = date.split(' ');
    const aDateFormat = formatDate[formatDate.length -1].split('/');
    date = `${formatMonth(aDateFormat[aDateFormat.length -2])} ${aDateFormat[aDateFormat.length -1]}`;
    return {
        date,
        year: date.split(' ')[1],
        month: date.split(' ')[0],
    };
}

const getCompanyShort = ( name ) => {
    
    let companyShort = '';

    if( name.toUpperCase().includes('CORPORATIVO') ) {
        companyShort = 'COR';
    } else if( name.toUpperCase().includes('PATRIMONIO') ) {
        companyShort = 'PAT';
    } else if( name.toUpperCase().includes('MVS')) {
        companyShort = 'MVS';
    } else if( name.toUpperCase().includes('DNO') ) {
        companyShort = 'DNO';
    } else if( name.toUpperCase().includes('MOVIMIENTOS') && name.toUpperCase().includes('PLUS') ) {
        companyShort = 'MOV';
    } else if( name.toUpperCase().includes('DOS') && name.toUpperCase().includes('MOVIMIENTO') ) {
        companyShort = 'DOS';
    } else if( name.toUpperCase().includes('VANGUARDIA') && name.toUpperCase().includes('FJ') ) {
        companyShort = 'VFJ';
    } else if( name.toUpperCase().includes('VANGUARDIA') && name.toUpperCase().includes('CREDITOS') ) {
        companyShort = 'VEC';
    } else if( name.toUpperCase().includes('ACTIVOS') && name.toUpperCase().includes('PRODUCTIVOS') ) {
        companyShort = 'ACT';
    } /*else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    } else if( name.toUpperCase().includes('') && name.toUpperCase().includes('') ) {
        companyShort = '';
    }*/ 

    return companyShort;

}

const getDateACompany = ( data ) => {
    let count = 0;
    let date = '';
    let company = '';
    let month = '';
    let year = '';
    for ( const i of data ) {
        if( count === 0 ) {
            for (const iterator in i) {
                if( i[iterator]?.includes('Balanza de comprobaci') ) {
                    date = formatDate( i[iterator] ).date;
                    year = formatDate( i[iterator] ).year;
                    month = formatDate( i[iterator] ).month;
                }
            }
        } else if( count === 1) {
            for (const iterator in i) {
                if( !iterator.includes('CONTPAQ') && !iterator.includes('EMPTY') && !iterator.includes('Hoja') ) {
                    company = iterator;
                }
            }
        }
        count++;
    }

    return { 
        date, 
        year,
        month,
        company,
        company_short: getCompanyShort(company),
    };
}

const isEmptySpace = ( v ) => {
    return v === ' ' ? null : v;
}

const aFormatData = ( data ) => {

    // const accountsEnabled = require('../public/groups-enabled.json');
    const { date, company, company_short, year, month } = getDateACompany(data);
    let isToContinue = true;
    let aData = [];
    let aGroupForAccount = [];
    data.forEach(element => {

        if (isToContinue) {
            
            if(element['CONTPAQ i'] === ' ') {
                isToContinue = false;
                return;
            }

            const aNames = [ 
                'cuenta', 
                'nombre', 
                'si-deudor', 
                'si-acreedor', 
                'cargos', 
                'abonos', 
                'sa-deudor', 
                'sa-acreedor',
                'isDad',
            ];
            let count = 0;
            let nData = {};
            for (const iterator of Object.values(element)) {
                nameKey = aNames[count];
                nData[`${nameKey}`] = isEmptySpace( iterator );
                count++;
            }

            nData['sa-acreedor'] = nData['sa-acreedor'] === null ? 
                                0 : 
                                parseFloat( nData['sa-acreedor'] ) ;

            nData['sa-deudor'] = nData['sa-deudor'] === null ? 
                                0 : 
                                parseFloat( nData['sa-deudor'] ) ;

            nData['si-acreedor'] = nData['si-acreedor'] === null ? 
                                0 : 
                                parseFloat( nData['si-acreedor'] ) ;
            
            nData['si-deudor'] = nData['si-deudor'] === null ? 
                                0 : 
                                parseFloat( nData['si-deudor'] ) ;

            nData['cargos'] = nData['cargos'] === null ? 
                                0 : 
                                parseFloat( nData['cargos'] ) ;
            
            nData['abonos'] = nData['abonos'] === null ? 
                                0 : 
                                parseFloat( nData['abonos'] ) ;
            nData = {
                ...nData,
                'saldo-final': nData['sa-acreedor'] + nData['sa-deudor']
            }

            nData['data'] = [];

            aData.push( nData );
            
        }

    });

    return  {
                date,
                year,
                month,
                company,
                company_short,
                // balance: aGroupForAccount,
                balance: aData,
            };

}

module.exports = aFormatData;