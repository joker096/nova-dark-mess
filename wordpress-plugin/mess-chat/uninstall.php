<?php
defined( 'ABSPATH' ) || exit;

if ( ! current_user_can( 'activate_' . basename( __DIR__ ) ) ) {
	wp_die( __( 'Unauthorized', 'mess-chat' ) );
}

delete_option( 'mess_chat_site_id' );
delete_option( 'mess_chat_enabled' );
delete_option( 'mess_chat_language' );
delete_option( 'mess_chat_position' );
delete_option( 'mess_chat_first_party' );
delete_option( 'mess_chat_proxy_url' );
