const SUCCESS_STATUS = 200;
const ERROR_STATUS = 400;
const SERVER_STATUS = 500;
const SUCCESS_MESSAGE = 'Success.';
const ERROR_MESSAGE = 'Error.';
const SERVER_MESSAGE = 'Server error.';

const handleResponse = ( res, status, content = {} ) => {
    return res.status( status ).json( content );
};

const handleResponseError = ( res, content = {} ) => {
    return res.status( ERROR_STATUS ).json( { ...content, message: ERROR_MESSAGE, status: ERROR_STATUS, } );
};

const handleResponseSuccess = ( res, data = {} ) => {
    return res.status( SUCCESS_STATUS ).json( { data, message: SUCCESS_MESSAGE, status: SUCCESS_STATUS, } );
};

const handleResponseErrorServer = ( res, content = {} ) => {
    return res.status( SERVER_STATUS ).json( { ...content, message: SERVER_MESSAGE, status: SERVER_STATUS, } );
};

module.exports = {
    handleResponse,
    handleResponseError,
    handleResponseSuccess,
    handleResponseErrorServer,
};