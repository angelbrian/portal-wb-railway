const express = require('express');
const { dataGralForMonth } = require('../../controllers/mongo/queries');
const { handleResponseSuccess } = require('../../helpers/multipleResponse');

const mngRouter = express.Router();

mngRouter.post( '/datagral', async ( req, res ) => {
    const { year, months, } = req.body;

    // return handleResponseSuccess( res, { year, months } );
    const data = await dataGralForMonth( year, months );

    return handleResponseSuccess( res, data );
} );

module.exports = mngRouter;