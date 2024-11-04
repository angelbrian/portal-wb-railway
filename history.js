

const insertInFinancialStatement = async () => {
    const c = {
        MVS: 1,
        VFJ: 2,
        COR: 3,
        PAT: 4,
        DNO: 5,
        MOV: 6,
        DOS: 7,
        VEC: 8,
        ACT: 9,
        GDL: 10,
        OCC: 11,
        REN: 12,
        FYJ: 13,
        GAR: 14,
        RUT: 15,
        MIN: 16,
        HMS: 17,
        DAC: 18,
        AGS: 19,
        SIN: 20,
        RPL: 21,
    }

    const m = {
        Abril: 4,
        Agosto: 8,
        Diciembre: 12,
        Enero: 1,
        Febrero: 2,
        Julio: 7,
        Junio: 6,
        Marzo: 3,
        Mayo: 5,
        Noviembre: 11,
        Octubre: 10,
        Septiembre: 9,
    }

    const month = 'Septiembre';
    const response = await Data.find({
        year: '2024',
        documentType: 'dataGralForMonth',
        __v: 0,
        month: { $in: [month] }
    }).select('values');

    const data = response[0] ? Object.values(response[0]).find(i => (i.values)).values : [];

    let dataRemake = [];
    Object.entries(data['2024'][month]).forEach(d => {

        const dataChilds = Object.values(d[1]);

        dataChilds.forEach(dC => {

            dataRemake = [
                ...dataRemake,
                [
                    m[month], c[d[0]], 1,
                    dC['cuenta'], dC['nombre'], dC['si-deudor'],
                    dC['si-acreedor'], dC['cargos'], dC['abonos'],
                    dC['sa-deudor'], dC['sa-acreedor'], dC['saldo-final']
                ]
            ];

        });

    });

    const respuesta = await insertFinancialStatements(dataRemake);

    return handleResponse(res, 200, { month, respuesta });
}

const insertInAccountsList = async () => {
    const c = {
        MVS: 1,
        VFJ: 2,
        COR: 3,
        PAT: 4,
        DNO: 5,
        MOV: 6,
        DOS: 7,
        VEC: 8,
        ACT: 9,
        GDL: 10,
        OCC: 11,
        REN: 12,
        FYJ: 13,
        GAR: 14,
        RUT: 15,
        MIN: 16,
        HMS: 17,
        DAC: 18,
        AGS: 19,
        SIN: 20,
        RPL: 21,
    }

    const response = await Data.find({
        year: '2024',
        documentType: 'gralList',
    }).select('values');

    const data = response[0] ? Object.values(response[0]).find(i => (i.values)).values : [];

    let dataRemake = [];

    const year_id = 1;

    Object.entries(data).forEach(value => {
        const company_id = c[value[0]];
        Object.values(value[1]).forEach(value2 => {
            const account = value2['cuenta'];
            const name = value2['nombre'];

            dataRemake = [
                ...dataRemake,
                [company_id, year_id, account, name]
            ];
        });
    });

    const result = await insertAccountsList(dataRemake);

    return handleResponse(res, 200, { dataRemake: dataRemake.length });
}

const insertInAccountsEnabled = async () => {
    const c = {
        MVS: 1,
        VFJ: 2,
        COR: 3,
        PAT: 4,
        DNO: 5,
        MOV: 6,
        DOS: 7,
        VEC: 8,
        ACT: 9,
        GDL: 10,
        OCC: 11,
        REN: 12,
        FYJ: 13,
        GAR: 14,
        RUT: 15,
        MIN: 16,
        HMS: 17,
        DAC: 18,
        AGS: 19,
        SIN: 20,
        RPL: 21,
    }

    const a = {
        ['APORTACIONES A']: 1,
        ['NUMERO FRIO']: 2,
        ['GEN 32']: 3,
        ['DXC']: 4,
        ['DXP']: 5,
        ['CARTERA']: 6,
        ['ER CONTPAQ']: 7,
        ['BANCOS']: 8,
        ['DXP TERCEROS']: 9,
    }

    const response = await Data.find({
        year: '2024',
        documentType: 'groupsEnabled',
    }).select('values');

    const data = response[0] ? Object.values(response[0]).find(i => (i.values)).values : [];

    let dataRemake = [];
    let notInData = [];
    const year_id = 1;

    const result = await getAccountsList({});

    Object.entries(data).forEach(value => {
        const company_id = c[value[0]];
        Object.entries(value[1]).forEach(value2 => {
            const agroup_id = value2[0] === 'ESTADO DE RESULTADOS' ?
                a['ER CONTPAQ'] :
                a[value2[0]];

            const accounts = value2[1];

            accounts.forEach(account => {
                const account_list = result.
                    find(v => v.account === account && v.company_id === company_id);

                // Para probar si existen cuentas que no están en agrupaciones
                if (!account_list) {
                    notInData = [
                        ...notInData,
                        { account, company_id }
                    ]
                }

                if (agroup_id == null) {
                    console.log('value2++++++', '**' + value2[0] + '**')
                }

                dataRemake = [
                    ...dataRemake,
                    [agroup_id, account_list.id]
                ];
            });
        });
    });

    const rows = await insertAccountsEnabled(dataRemake);

    return handleResponse(res, 200, { dataRemake: dataRemake.length });
}