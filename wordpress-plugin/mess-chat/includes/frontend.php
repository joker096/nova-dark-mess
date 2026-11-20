<?php
defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'Mess_Chat_Frontend' ) ) {

	/**
	 * Frontend asset enqueue for Mess&Anger Chat Widget.
	 */
	final class Mess_Chat_Frontend {

		public static function enqueue() {
			if ( ! (bool) get_option( Mess_Chat_Settings::OPTION_ENABLED, false ) ) {
				return;
			}
			$site_id = get_option( Mess_Chat_Settings::OPTION_SITE_ID, '' );
			if ( empty( $site_id ) ) {
				return;
			}
			$language = get_option( Mess_Chat_Settings::OPTION_LANGUAGE, 'en' );
			$position = get_option( Mess_Chat_Settings::OPTION_POSITION, 'bottom-right' );

			$loader_url = (bool) get_option( Mess_Chat_Settings::OPTION_FIRST_PARTY, false )
				? ( $proxy_url = get_option( Mess_Chat_Settings::OPTION_PROXY_URL, '' ) ) ? esc_url( $proxy_url . '/wvc-loader.js' ) : esc_url( home_url( '/' ) ) . 'wvc-loader.js'
				: esc_url( 'https://mess.cvr.name/widget/loader.js' );

			?>
			<script async src="<?php echo $loader_url; ?>" data-site="<?php echo esc_attr( $site_id ); ?>" data-language="<?php echo esc_attr( $language ); ?>" data-position="<?php echo esc_attr( $position ); ?>"></script>
			<?php
		}
	}
}
