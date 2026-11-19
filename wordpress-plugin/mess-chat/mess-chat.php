<?php
/**
 * Plugin Name: Mess&Anger Chat Widget
 * Plugin URI: https://mess.cvr.name/docs/widget
 * Description: Embed the Mess&Anger chat widget on your WordPress site. Visitors can message you without registration; you reply from the Mess&Anger app.
 * Version: 1.0.0
 * Author: Mess&Anger
 * Author URI: https://mess.cvr.name/
 * License: GPL-2.0+
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: mess-chat
 * Domain Path: /languages
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'Mess_Chat' ) ) {

	require_once plugin_dir_path( __FILE__ ) . 'includes/settings.php';
	require_once plugin_dir_path( __FILE__ ) . 'includes/frontend.php';

	/**
	 * Main Mess&Anger Chat Widget plugin class.
	 */
	final class Mess_Chat {

		private static $instance = null;

		public static function instance() {
			if ( null === self::$instance ) {
				self::$instance = new self();
			}
			return self::$instance;
		}

		private function __construct() {
			add_action( 'plugins_loaded', array( $this, 'init' ) );
		}

		public function init() {
			load_plugin_textdomain( 'mess-chat', false, plugin_basename( dirname( __FILE__ ) ) . '/languages' );

			add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
			add_action( 'admin_init', array( $this, 'register_settings' ) );
			add_action( 'admin_enqueue_scripts', array( $this, 'admin_assets' ) );
			add_action( 'wp_enqueue_scripts', array( $this, 'frontend_assets' ) );
			add_action( 'template_redirect', array( $this, 'serve_loader' ) );
			add_action( 'admin_post_mess_chat_connect', array( $this, 'handle_connect' ) );
			add_action( 'wp_privacy_personal_data_erasers', array( $this, 'privacy_eraser' ) );
			add_filter( 'wp_add_privacy_policy_content', array( $this, 'privacy_policy_content' ) );

			register_uninstall_hook( __FILE__, array( $this, 'uninstall' ) );
		}

		public function add_admin_menu() {
			add_options_page(
				__( 'Mess Chat', 'mess-chat' ),
				__( 'Mess Chat', 'mess-chat' ),
				'manage_options',
				'mess-chat',
				array( 'Mess_Chat_Settings', 'render_page' )
			);
		}

		public function register_settings() {
			Mess_Chat_Settings::register();
		}

		public function admin_assets( $hook ) {
			if ( 'options-general.php' !== $hook ) {
				return;
			}
			wp_enqueue_script( 'jquery' );
		}

		public function frontend_assets() {
			Mess_Chat_Frontend::enqueue();
		}

		public function privacy_policy_content() {
			$content = sprintf(
				/* translators: %s: site name */
				__( 'This site uses the Mess&Anger chat widget. When a visitor opens the chat, a guest session is created on Mess&Anger servers. Messages are end-to-end encrypted; Mess&Anger does not store message content in plain text. No personal data is collected until the visitor chooses to send a message. See https://mess.cvr.name/privacy for details.', 'mess-chat' ),
				esc_html( get_bloginfo( 'name' ) )
			);
			return $content;
		}

		public function privacy_eraser( $erasers ) {
			$erasers['mess-chat'] = array(
				'eraser_name' => __( 'Mess&Anger chat data', 'mess-chat' ),
				'callback'    => array( $this, 'erase_personal_data' ),
			);
			return $erasers;
		}

		public function erase_personal_data( $email_address, $page = 1 ) {
			return array(
				'items_removed'  => 0,
				'items_retained' => 0,
				'messages'       => array(),
				'done'           => true,
			);
		}

		public function serve_loader() {
			if ( strpos( $_SERVER['REQUEST_URI'] ?? '', '/wvc-loader.js' ) !== false ) {
				header( 'Content-Type: application/javascript; charset=utf-8' );
				header( 'Cache-Control: public, max-age=31536000, immutable' );
				readfile( plugin_dir_path( __FILE__ ) . 'wvc-loader.js' );
				exit;
			}
		}

		public static function handle_connect() {
			if ( ! current_user_can( 'manage_options' ) ) {
				wp_die( __( 'Unauthorized', 'mess-chat' ) );
			}
			check_admin_referer( Mess_Chat_Settings::CONNECT_NONCE, 'mess_chat_connect_nonce' );

			$site_id = isset( $_POST['site_id'] ) ? sanitize_text_field( $_POST['site_id'] ) : '';
			if ( empty( $site_id ) ) {
				wp_die( __( 'Site ID is required', 'mess-chat' ) );
			}

			update_option( Mess_Chat_Settings::OPTION_SITE_ID, $site_id );
			wp_safe_redirect( admin_url( 'options-general.php?page=mess-chat&connected=1' ) );
			exit;
		}

		public static function uninstall() {
			delete_option( Mess_Chat_Settings::OPTION_SITE_ID );
			delete_option( Mess_Chat_Settings::OPTION_ENABLED );
			delete_option( Mess_Chat_Settings::OPTION_LANGUAGE );
			delete_option( Mess_Chat_Settings::OPTION_POSITION );
			delete_option( Mess_Chat_Settings::OPTION_FIRST_PARTY );
		}
	}

	Mess_Chat::instance();
}
