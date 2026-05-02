<?php
// +------------------------------------------------------------------------+
// | @author Deen Doughouz (DoughouzForest)
// | @author_url 1: http://www.playtubescript.com
// | @author_url 2: http://codecanyon.net/user/doughouzforest
// | @author_email: wowondersocial@gmail.com
// +------------------------------------------------------------------------+
// | PlayTube - The Ultimate Video Sharing Platform
// | Copyright (c) 2017 PlayTube. All rights reserved.
// +------------------------------------------------------------------------+
function pt_env_or_default($env_name, $default) {
    $value = getenv($env_name);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

// MySQL Hostname
$sql_db_host = pt_env_or_default('DB_HOST', "localhost");
// MySQL Database User
$sql_db_user = pt_env_or_default('DB_USERNAME', "admin_chef-be");
// MySQL Database Password
$sql_db_pass = pt_env_or_default('DB_PASSWORD', "@Sharingan06200");
// MySQL Database Name
$sql_db_name = pt_env_or_default('DB_DATABASE', "admin_chef-be");

// Site URL
$site_url = rtrim(pt_env_or_default('APP_URL', "https://www.chef-be.fr"), '/'); // e.g (http://example.com)

$auto_redirect = filter_var(pt_env_or_default('AUTO_REDIRECT', 'true'), FILTER_VALIDATE_BOOLEAN);

$siteEncryptKey = pt_env_or_default('SITE_ENCRYPT_KEY', "eb61d1fc75fc1eb46de41ddce08f2a7dc42a1b3c"); // Your site encrypt key, don't give it to anyone.

?>
