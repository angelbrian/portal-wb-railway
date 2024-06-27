//const data = require('./Enero.xlsx.json');
const fs = require('fs');

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

    if( name.includes('COR') ) {
        companyShort = 'COR';
    } else if( name.includes('PAT') ) {
        companyShort = 'PAT';
    } else if( name.includes('MVS')) {
        companyShort = 'MVS';
    } else if( name.includes('DNO') ) {
        companyShort = 'DNO';
    } else if( name.includes('MOV') ) {
        companyShort = 'MOV';
    } else if( name.includes('DOS') ) {
        companyShort = 'DOS';
    } else if( name.includes('VFJ') || name === 'VANGUARDIA FJ SAPI DE CV SOFOM ENR' ) {
        companyShort = 'VFJ';
    } else if( name.includes('VEC') ) {
        companyShort = 'VEC';
    }

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
                'sa-acreedor'
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

            aData.push( nData );
            
        }

    });

    const mainAccounts = aData.filter((i) => {
        const aAccount = i.cuenta.split(`-`);
        return i.cuenta.includes(`-000-000`) || 
                ( 
                    aAccount ? 
                    ( (aAccount[0] === `000` && aAccount[2] === `000`) ? true : false ) :
                    false
                );
    });

    for (const key in mainAccounts) {

        const account = mainAccounts[key].cuenta;
        const aAccount = account.split(`-`);
        const fAccount = aAccount[0] === `000` ? 
                        `${aAccount[0]}-${aAccount[1]}-` : 
                        `${aAccount[0]}-`;
        const fAccountLength = fAccount.split('-').length;
        const data = aData.filter((i) => {
            return i.cuenta !== account && 
                    (fAccountLength === 3 ?
                    `${i.cuenta.split('-')[0]}`.includes(fAccount) :
                    `${i.cuenta.split('-')[0]}-` === fAccount);
        });
        
        aGroupForAccount.push({ ...mainAccounts[key], data })
        
    }
    
    const { date, company, company_short, year, month } = getDateACompany(data);
    // console.log({ date, company, company_short, year, month })
    
    // return {
    //     [year]: {
    //         [month]: {
    //             [company_short]: {
    //                 date,
    //                 company,
    //                 company_short,
    //                 balance: aGroupForAccount,
    //             }
    //         }
    //     }
    // };

    return  {
                date,
                year,
                month,
                company,
                company_short,
                balance: aGroupForAccount,
            };

}

module.exports = aFormatData;