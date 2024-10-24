
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

export const formatCars = ( jsonData, companies, initialLevel2 ) => {
    let dataUpload = {};
    let activeGetDate = true;
    let month = null;
    let year = null;
    let keysLevel2 = {
        ...initialLevel2
    };
    // let keysLevel2 = aFormatData.getNode( await Data.find({ year: 2024, type: 'keys', documentType: 'rxc' }).select('values') );

    companies.forEach(company => {

        let keysLevel2Temp = {};

        const schemaForCompany = jsonData.filter( ( value ) => {

            return value.find( ( { text } ) => {

                if ( typeof( text ) === 'string' ) {
                
                    return text.toLowerCase().includes( `${ company.toLowerCase() }-` );

                } else if( 
                    typeof( text ) === 'object' &&
                    activeGetDate
                ) {

                    month = formatMonth( 
                        new Date( `${ text }` ).getUTCMonth() + 1
                    );

                    year = new Date( `${ text }` ).getFullYear();

                    activeGetDate = false;

                }

                return false;

            });

        })
        .map( ( value ) => {
            
            let newValuesTemp = {};

            value.forEach( ( subValue, index ) => {

            if( jsonData?.[0]?.[index]?.['text'] ) {
                let nameNode = jsonData[0][index]['text'].toLowerCase();

                switch ( nameNode ) {
                    case 'notas':
                        nameNode = 'nombre';
                      break;
                    default:
                      break;
                  }

                let isNumber = false;

                if ( nameNode === 'notas' ) {
                    keysLevel2Temp = {
                        ...keysLevel2Temp,
                        [subValue.text]: true,
                    };
                } else if( nameNode === 'valor' ) {
                    isNumber = true;
                }

                newValuesTemp = {
                    ...newValuesTemp,
                    [nameNode]: isNumber ? parseFloat( `${ subValue.text }`.replaceAll(',', '').replaceAll('$', '') ) : subValue.text,
                }
            }

            });

            return newValuesTemp;

        });
            
        dataUpload = {
            ...dataUpload,
            [company]: {
                [month]: 0,
                // schemaForCompany
                // .reduce( 
                //   ( acc, currentValue ) => {

                //     // console.log(currentValue);
                //     const cV = currentValue['saldo-final']//currentValue.find( subCurrentValue => subCurrentValue['saldo-final'] )['saldo-final'];
                //     const cVFormat = `${ cV }`.replaceAll(',', '');
                //     return acc + parseFloat( cVFormat );
                    
                //   }, 0),
                level2: Object.values( schemaForCompany ),
            },
        }

        keysLevel2 = {
            ...keysLevel2,
            [company]: {
                ...keysLevel2[company],
                ...keysLevel2Temp
            },
        }

    });

    return {
        month,
        year,
        dataUpload,
        keysLevel2,
    };
}