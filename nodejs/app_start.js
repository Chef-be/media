var fs = require('fs');
try {
	if (!config) {
		var file = fs.readFileSync(__dirname + '/config.json', 'utf8');
	    var config = JSON.parse(file);
	}
} catch (e) {
	console.log(e);
}

const db_hostname = process.env.DB_HOSTNAME || config.db_hostname;
const db_username = process.env.DB_USERNAME || config.db_username;
const db_password = process.env.DB_PASSWORD || config.db_password;
const db_dbname = process.env.DB_DBNAME || config.db_dbname;
const amazon = (process.env.AMAZON || config.amazon);
const amazon_bucket = process.env.AMAZON_BUCKET || config.amazon_bucket;

// server setup
const server_ip = process.env.SERVER_IP || config.server_ip;
const server_port = process.env.SERVER_PORT || config.server_port;

const site_url = process.env.SITE_URL || config.site_url; 

const ssl = (process.env.SSL || config.ssl);
const ssl_privatekey_full_path = process.env.SSL_PRIVATEKEY_FULL_PATH || config.ssl_privatekey_full_path;
const ssl_cert_full_path = process.env.SSL_CERT_FULL_PATH || config.ssl_cert_full_path;

module.exports = {
	db_hostname,
	db_username,
	db_password,
	db_dbname,
	server_ip,
	server_port,
	site_url,
	amazon,
	amazon_bucket,
	ssl,
	ssl_privatekey_full_path,
	ssl_cert_full_path,
};
