<?php
defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'Mess_Chat_Settings' ) ) {

	/**
	 * Settings page and registration for Mess&Anger Chat Widget.
	 */
	final class Mess_Chat_Settings {

		const OPTION_SITE_ID      = 'mess_chat_site_id';
		const OPTION_ENABLED      = 'mess_chat_enabled';
		const OPTION_LANGUAGE     = 'mess_chat_language';
		const OPTION_POSITION     = 'mess_chat_position';
		const OPTION_FIRST_PARTY  = 'mess_chat_first_party';
		const OPTION_PROXY_URL    = 'mess_chat_proxy_url';
		const CONNECT_NONCE       = 'mess_chat_connect_nonce';

		public static function register() {
			register_setting( 'mess_chat_group', self::OPTION_SITE_ID, array(
				'type'            => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_site_id' ),
				'default'         => '',
			) );
			register_setting( 'mess_chat_group', self::OPTION_ENABLED, array(
				'type'            => 'boolean',
				'sanitize_callback' => 'wp_validate_boolean',
				'default'         => false,
			) );
			register_setting( 'mess_chat_group', self::OPTION_LANGUAGE, array(
				'type'            => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_language' ),
				'default'         => 'en',
			) );
			register_setting( 'mess_chat_group', self::OPTION_POSITION, array(
				'type'            => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_position' ),
				'default'         => 'bottom-right',
			) );
			register_setting( 'mess_chat_group', self::OPTION_FIRST_PARTY, array(
				'type'            => 'boolean',
				'sanitize_callback' => 'wp_validate_boolean',
				'default'         => false,
			) );
			register_setting( 'mess_chat_group', self::OPTION_PROXY_URL, array(
				'type'            => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_proxy_url' ),
				'default'         => '',
			) );
		}

		public static function sanitize_site_id( $value ) {
			return sanitize_text_field( $value );
		}

		public static function sanitize_language( $value ) {
			$value = sanitize_text_field( $value );
			return in_array( $value, array( 'en', 'ru' ), true ) ? $value : 'en';
		}

		public static function sanitize_position( $value ) {
			$value = sanitize_text_field( $value );
			return in_array( $value, array( 'bottom-right', 'bottom-left' ), true ) ? $value : 'bottom-right';
		}

		public static function sanitize_proxy_url( $value ) {
			$value = esc_url_raw( $value );
			if ( $value && ! preg_match( '|^https?://|i', $value ) ) {
				$value = '';
			}
			return rtrim( $value, '/' );
		}

		public static function render_page() {
			if ( ! current_user_can( 'manage_options' ) ) {
				return;
			}

			$site_id     = get_option( self::OPTION_SITE_ID, '' );
			$enabled     = (bool) get_option( self::OPTION_ENABLED, false );
			$language    = get_option( self::OPTION_LANGUAGE, 'en' );
			$position    = get_option( self::OPTION_POSITION, 'bottom-right' );
			$first_party = (bool) get_option( self::OPTION_FIRST_PARTY, false );
			$proxy_url   = get_option( self::OPTION_PROXY_URL, '' );
			$nonce       = wp_create_nonce( self::CONNECT_NONCE );

			$connect_url = add_query_arg( array(
				'return' => urlencode( admin_url( 'options-general.php?page=mess-chat&connected=1' ) ),
			), 'https://mess.cvr.name/connect' );

			?>
			<div class="wrap">
				<h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
				<p><?php _e( 'Embed the Mess&Anger chat widget on your WordPress site. Visitors can message you without registration; you reply from the Mess&Anger app.', 'mess-chat' ); ?></p>

				<form method="post" action="options.php">
					<?php settings_fields( 'mess_chat_group' ); ?>
					<?php do_settings_sections( 'mess_chat_group' ); ?>

					<table class="form-table">
						<tr>
							<th scope="row"><?php _e( 'Enabled', 'mess-chat' ); ?></th>
							<td>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION_ENABLED ); ?>" value="1" <?php checked( $enabled, true ); ?> />
								<label><?php _e( 'Show the chat widget on the public site.', 'mess-chat' ); ?></label>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php _e( 'Site ID', 'mess-chat' ); ?></th>
							<td>
								<input type="text" name="<?php echo esc_attr( self::OPTION_SITE_ID ); ?>" value="<?php echo esc_attr( $site_id ); ?>" class="regular-text" />
								<p class="description"><?php _e( 'Your Mess&Anger site ID. Get it from the "Сайты" screen in the app.', 'mess-chat' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php _e( 'Language', 'mess-chat' ); ?></th>
							<td>
								<select name="<?php echo esc_attr( self::OPTION_LANGUAGE ); ?>">
									<option value="en" <?php selected( $language, 'en' ); ?>><?php _e( 'English', 'mess-chat' ); ?></option>
									<option value="ru" <?php selected( $language, 'ru' ); ?>><?php _e( 'Русский', 'mess-chat' ); ?></option>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php _e( 'Position', 'mess-chat' ); ?></th>
							<td>
								<select name="<?php echo esc_attr( self::OPTION_POSITION ); ?>">
									<option value="bottom-right" <?php selected( $position, 'bottom-right' ); ?>><?php _e( 'Bottom right', 'mess-chat' ); ?></option>
									<option value="bottom-left" <?php selected( $position, 'bottom-left' ); ?>><?php _e( 'Bottom left', 'mess-chat' ); ?></option>
								</select>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php _e( 'First-party mode', 'mess-chat' ); ?></th>
							<td>
								<input type="checkbox" name="<?php echo esc_attr( self::OPTION_FIRST_PARTY ); ?>" value="1" <?php checked( $first_party, true ); ?> />
								<label><?php _e( 'Serve the widget loader from your own domain (helps bypass ad blockers).', 'mess-chat' ); ?></label>
								<p class="description"><?php _e( 'Requires server-side proxy configuration. See plugin documentation.', 'mess-chat' ); ?></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php _e( 'Proxy URL', 'mess-chat' ); ?></th>
							<td>
								<input type="url" name="<?php echo esc_attr( self::OPTION_PROXY_URL ); ?>" value="<?php echo esc_attr( $proxy_url ); ?>" class="regular-text" />
								<p class="description"><?php printf( __( 'Your first-party proxy base URL (no trailing slash), e.g. <code>https://chat.%1$s</code>. Leave empty to use %2$s.', 'mess-chat' ), esc_html( get_bloginfo( 'domain' ) ), esc_html( 'https://mess.cvr.name/widget/loader.js' ) ); ?></p>
							</td>
						</tr>
					</table>

					<?php if ( empty( $site_id ) ) : ?>
						<p>
							<a href="<?php echo esc_url( $connect_url ); ?>" class="button button-primary">
								<?php _e( 'Подключить через Mess&Anger', 'mess-chat' ); ?>
							</a>
							<?php wp_nonce_field( self::CONNECT_NONCE, 'mess_chat_connect_nonce' ); ?>
						</p>
						<p class="description"><?php _e( 'Opens the Mess&Anger connection page. After confirmation in the app, you will return here with your Site ID filled in.', 'mess-chat' ); ?></p>
					<?php else : ?>
						<p class="description">
							<?php printf( __( 'Widget snippet: <code>&lt;script async src="%1$s/widget/loader.js" data-site="%2$s"&gt;&lt;/script&gt;</code>', 'mess-chat' ), esc_url( home_url( '/' ) ), esc_html( $site_id ) );
							?>
						</p>
						<p>
							<button type="button" class="button" id="mess-chat-copy-snippet"><?php _e( 'Копировать сниппет', 'mess-chat' ); ?></button>
						</p>
					<?php endif; ?>

					<?php submit_button( __( 'Save Changes', 'mess-chat' ) ); ?>
				</form>

				<?php if ( isset( $_GET['connected'] ) ) : ?>
					<div class="notice notice-success is-dismissible">
						<p><?php _e( 'Site connected successfully!', 'mess-chat' ); ?></p>
					</div>
				<?php endif; ?>
			</div>
			<script>
				jQuery( document ).ready( function( $ ) {
					$( '#mess-chat-copy-snippet' ).on( 'click', function() {
						var snippet = '&lt;script async src="' + window.location.origin + '/widget/loader.js" data-site="<?php echo esc_js( $site_id ); ?>"&gt;&lt;/script&gt;';
						navigator.clipboard.writeText( snippet ).then( function() {
							var btn = $( '#mess-chat-copy-snippet' );
							var orig = btn.text();
							btn.text( '<?php _e( 'Скопировано!', 'mess-chat' ); ?>' );
							setTimeout( function() { btn.text( orig ); }, 2000 );
						} );
					} );
				} );
			</script>
			<?php
		}

		public static function handle_connect() {
			if ( ! current_user_can( 'manage_options' ) ) {
				wp_die( __( 'Unauthorized', 'mess-chat' ) );
			}
			check_admin_referer( self::CONNECT_NONCE, 'mess_chat_connect_nonce' );

			$site_id = isset( $_POST['site_id'] ) ? sanitize_text_field( $_POST['site_id'] ) : '';
			if ( empty( $site_id ) ) {
				wp_die( __( 'Site ID is required', 'mess-chat' ) );
			}

			update_option( self::OPTION_SITE_ID, $site_id );
			wp_safe_redirect( admin_url( 'options-general.php?page=mess-chat&connected=1' ) );
			exit;
		}
	}
}
