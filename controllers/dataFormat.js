const getMonthsUntilNow = () => {

    const months = [];
    const currentDate = new Date();
    const currentMonth = 11//currentDate.getMonth();
  
    for (let i = 0; i <= currentMonth; i++) {
      let monthName = new Date(2020, i).toLocaleString('es-ES', { month: 'long' });
      monthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      months.push(monthName);
    }
  
    return months;

}

const formatMonth = ( name ) => {
    let month = '';
    switch (true) {
        case ( name === 'Ene' || name === 1 ):
            month = 'Enero';
            break;
        case ( name === 'Feb' || name === 2 ):
            month = 'Febrero';
        break;
        case ( name === 'Mar' || name === 3 ):
            month = 'Marzo';
        break;
        case ( name === 'Abr' || name === 4 ):
            month = 'Abril';
        break;
        case ( name === 'May' || name === 5 ):
            month = 'Mayo';
        break;
        case ( name === 'Jun' || name === 6 ):
            month = 'Junio';
        break;
        case ( name === 'Jul' || name === 7 ):
            month = 'Julio';
        break;
        case ( name === 'Ago' || name === 8 ):
            month = 'Agosto';
        break;
        case ( name === 'Sep' || name === 9 ):
            month = 'Septiembre';
        break;
        case ( name === 'Oct' || name === 10 ):
            month = 'Octubre';
        break;
        case ( name === 'Nov' || name === 11 ):
            month = 'Noviembre';
        break;
        case ( name === 'Dic' || name === 12 ):
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
    } else if( name.toUpperCase().includes('ARRENDA') && name.toUpperCase().includes('AGUASCALIENTES') ) {
        companyShort = 'AGS';
    } else if( name.toUpperCase().includes('OPERADORA') && name.toUpperCase().includes('DACT') ) {
        companyShort = 'DAC';
    } else if( name.toUpperCase().includes('ARRENDA') && name.toUpperCase().includes('FYJ') ) {
        companyShort = 'FYJ';
    } else if( name.toUpperCase().includes('REGIOMONTANO') && name.toUpperCase().includes('ASOCIADOS') ) {
        companyShort = 'GAR';
    } else if( name.toUpperCase().includes('ARRENDA') && name.toUpperCase().includes('GDL') ) {
        companyShort = 'GDL';
    } else if( name.toUpperCase().includes('ARRENDADORA') && name.toUpperCase().includes('HMS') ) {
        companyShort = 'HMS';
    } else if( name.toUpperCase().includes('ARRENDADORA') && name.toUpperCase().includes('MINERVA') ) {
        companyShort = 'MIN';
    } else if( name.toUpperCase().includes('ARRENDA') && name.toUpperCase().includes('OCCIDENTAL') ) {
        companyShort = 'OCC';
    } else if( name.toUpperCase().includes('RENTAS') && name.toUpperCase().includes('PRODUCTIVAS') ) {
        companyShort = 'REN';
    } else if( name.toUpperCase().includes('RENTAL') && name.toUpperCase().includes('PLUS') ) {
        companyShort = 'RPL';
    } else if( name.toUpperCase().includes('REPARTO') && name.toUpperCase().includes('UTIL') ) {
        companyShort = 'RUT';
    } else if( name.toUpperCase().includes('SINERGIA') && name.toUpperCase().includes('AVANTE') ) {
        companyShort = 'SIN';
    }

    return companyShort;

}

const aFormatData = ( data ) => {
    
    let date = '', 
        company = '', 
        month = '', 
        year = '', 
        company_short = '';

    let balance = [];
    let balanceGral = {};
    let balanceChilds = [];
    let isBold = false;
    let isBoldPosition = 0;

    data.forEach(( element, index ) => {
        if( index === 0 ) {
            element.forEach(( value ) => {
                if( value.text !== null && !value.text.includes('CONTPAQ') && !value.text.includes('Hoja') ) {
                    company = value.text;
                    company_short = getCompanyShort(company);
                }
            });
        } else if( index === 1 ) {
            element.forEach(( value ) => {
                if( value.text !== null && value.text.includes('Balanza de comprobaci') ) {
                    const dateFormat = formatDate( value.text );
                    date = dateFormat.date;
                    year = dateFormat.year;
                    month = dateFormat.month;
                }
            });
        } else {
            if( element[0]?.text !== null && !element[0]?.text.includes(' ') && element[1]?.text!== null ) {

                const dataTemp = {};
                dataTemp['cuenta'] = element[0]?.text;
                dataTemp['nombre'] = element[1]?.text;
                dataTemp['si-deudor'] = parseFloat( element[2]?.text ) ? parseFloat( element[2]?.text ) : 0;
                dataTemp['si-acreedor'] = parseFloat( element[3]?.text ) ? parseFloat( element[3]?.text ) : 0;
                dataTemp['cargos'] = parseFloat( element[4]?.text ) ? parseFloat( element[4]?.text ) : 0;
                dataTemp['abonos'] = parseFloat( element[5]?.text ) ? parseFloat( element[5]?.text ) : 0;
                dataTemp['sa-deudor'] = parseFloat( element[6]?.text ) ? parseFloat( element[6]?.text ) : 0;
                dataTemp['sa-acreedor'] = parseFloat( element[7]?.text ) ? parseFloat( element[7]?.text ) : 0;
                dataTemp['saldo-final'] = dataTemp['sa-acreedor'] + dataTemp['sa-deudor'];
                dataTemp['data'] = [];

                if( element[1]?.text !== 'ACTIVO' && element[1]?.text !== 'CIRCULANTE' ) {

                    isBold = element[0].bold;
                    
                    if ( isBold ) {
                        if ( balanceChilds.length > 0) {
                            // console.log(isBoldPosition, element[0]?.text, balance)
                            if( !balance[isBoldPosition - 1] )
                                balance[isBoldPosition - 1] = {};
                            
                            balance[isBoldPosition - 1]['data'] = balanceChilds;
                            balanceChilds = [];
                        }
                        
                        isBoldPosition = balance.push( dataTemp );
                    } else {
                        balanceChilds.push( dataTemp );
                    }

                } else {
                    balance.push( dataTemp );
                }
                balanceGral[dataTemp['cuenta']] = { ...dataTemp };
            }
        }
    });

    if( balanceChilds.length > 0 )
        balance[isBoldPosition - 1]['data'] = balanceChilds;
    
    return {
        data: { 
            date, 
            year,
            month,
            company,
            company_short,
            balance,
        },
        dataGral: balanceGral,
    };

}

const getNode = ( data ) => {

    return data[0] ? Object.values( data[0] ).find(i => ( i.values )).values : [];

}

const getNodeMultiple = ( data ) => {

    return Object.values( data ).find(i => ( i.values )).values;

}

const getCurrentYear = () => new Date().getFullYear();

module.exports = {
    formatMonth,
    getCurrentYear,
    aFormatData,
    getMonthsUntilNow,
    getNode,
    getNodeMultiple,
}