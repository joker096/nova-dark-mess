# Server FTP Setup for `deploy` user

Run these commands on your server (mess.cvr.name) as root to set up FTP access for the `deploy` user.

## 1. Create the `deploy` user and set password

```bash
# Create user with home directory at the landing root
useradd -m -d /var/www/mess.cvr.name -s /bin/bash deploy

# Set a strong password for FTP login
passwd deploy
# Enter password twice when prompted
```

## 2. Install and configure vsftpd (secure FTP server)

```bash
# Install vsftpd
apt update && apt install -y vsftpd

# Backup original config
cp /etc/vsftpd.conf /etc/vsftpd.conf.backup
```

## 3. Configure vsftpd for secure FTP with chroot

Create `/etc/vsftpd.conf`:

```bash
cat > /etc/vsftpd.conf <<'EOF'
# Basic settings
listen=YES
listen_ipv6=NO
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
use_localtime=YES
xferlog_enable=YES
connect_from_port_20=YES

# Chroot users to their home directory
chroot_local_user=YES
allow_writeable_chroot=YES

# Passive mode settings (required for firewall/NAT)
pasv_enable=YES
pasv_min_port=40000
pasv_max_port=40100
pasv_address=YOUR_SERVER_IP  # Replace with your server's public IP

# SSL/TLS (FTPS) - recommended for security
ssl_enable=YES
rsa_cert_file=/etc/letsencrypt/live/mess.cvr.name/fullchain.pem
rsa_private_key_file=/etc/letsencrypt/live/mess.cvr.name/privkey.pem
ssl_sslv2=NO
ssl_sslv3=NO
ssl_tlsv1=YES
ssl_tlsv1_1=YES
ssl_tlsv1_2=YES
ssl_tlsv1_3=YES
require_ssl_reuse=NO
ssl_ciphers=HIGH

# Force SSL for data and control connections
force_local_data_ssl=YES
force_local_logins_ssl=YES

# Logging
xferlog_file=/var/log/vsftpd.log
xferlog_std_format=YES
dual_log_enable=YES
vsftpd_log_file=/var/log/vsftpd.log

# Performance
idle_session_timeout=600
data_connection_timeout=120
accept_timeout=60
connect_timeout=60

# User isolation
user_sub_token=$USER
local_root=/var/www/mess.cvr.name
EOF
```

**Important:** Replace `YOUR_SERVER_IP` with your server's actual public IP address.

## 4. Open firewall ports

```bash
# UFW (Ubuntu/Debian)
ufw allow 21/tcp          # FTP command port
ufw allow 40000:40100/tcp # Passive mode ports
ufw allow 990/tcp         # FTPS (implicit SSL)
ufw reload

# Or iptables
iptables -A INPUT -p tcp --dport 21 -j ACCEPT
iptables -A INPUT -p tcp --dport 40000:40100 -j ACCEPT
iptables -A INPUT -p tcp --dport 990 -j ACCEPT
```

## 5. Fix permissions for the landing directory

```bash
# Ensure deploy user owns the landing directory
chown -R deploy:deploy /var/www/mess.cvr.name

# Set proper permissions (deploy can write, nginx can read)
chmod 755 /var/www/mess.cvr.name
find /var/www/mess.cvr.name -type d -exec chmod 755 {} \;
find /var/www/mess.cvr.name -type f -exec chmod 644 {} \;

# If using nginx with www-data group, add deploy to www-data
usermod -a -G www-data deploy
# Or set ACL for nginx access
setfacl -R -m u:www-data:rx /var/www/mess.cvr.name
setfacl -R -d -m u:www-data:rx /var/www/mess.cvr.name
```

## 6. Restart vsftpd

```bash
systemctl restart vsftpd
systemctl enable vsftpd
systemctl status vsftpd
```

## 7. Test FTP access

From your local machine:

```bash
# Test with FTP client (FileZilla, WinSCP, or command line)
# Host: mess.cvr.name
# User: deploy
# Password: [what you set in step 1]
# Port: 21 (or 990 for FTPS implicit)
# Protocol: FTP - File Transfer Protocol
# Encryption: Require explicit FTP over TLS (recommended)

# Command line test:
ftp -p mess.cvr.name 21
# Or with lftp (supports FTPS better):
lftp -u deploy,password -e "set ftp:ssl-force true; set ssl:verify-certificate no" mess.cvr.name
```

## 8. Deploy the 3D landing page via FTP

After FTP is set up, you can deploy using the local script:

```bash
# From your local machine (project root):
node scripts/deploy-3d-landing.js --deploy deploy@mess.cvr.name

# Or manually via SCP (if SSH key is set up):
scp -r landing-3d/landing deploy@mess.cvr.name:/var/www/mess.cvr.name/

# Or upload via FTP client (FileZilla/WinSCP):
# Connect to mess.cvr.name as deploy user
# Upload contents of landing-3d/landing/ to /var/www/mess.cvr.name/
```

## 9. Reload nginx (if using gzip_static/brotli_static)

```bash
# On server after FTP upload:
nginx -t && systemctl reload nginx
```

## Troubleshooting

### FTP connection fails
```bash
# Check vsftpd logs
tail -f /var/log/vsftpd.log

# Check if vsftpd is running
systemctl status vsftpd

# Test passive mode ports
netstat -tlnp | grep :40000
```

### Permission denied on upload
```bash
# Verify ownership
ls -la /var/www/mess.cvr.name/

# Fix if needed
chown -R deploy:deploy /var/www/mess.cvr.name
chmod -R 755 /var/www/mess.cvr.name
```

### FTPS certificate issues
```bash
# Verify certificate paths exist
ls -la /etc/letsencrypt/live/mess.cvr.name/

# If using self-signed (not recommended for production):
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/vsftpd.key \
  -out /etc/ssl/certs/vsftpd.pem
# Then update vsftpd.conf with these paths
```

## Quick Deploy Commands Summary

After FTP is configured, you can deploy the 3D landing page with:

```bash
# Option 1: Using the deploy script (recommended)
LANDING_HOST=deploy@mess.cvr.name node scripts/deploy-3d-landing.js --deploy

# Option 2: Manual SCP (if SSH keys configured)
scp -r landing-3d/landing deploy@mess.cvr.name:/var/www/mess.cvr.name/

# Option 3: FTP client (FileZilla/WinSCP)
# Host: mess.cvr.name
# User: deploy
# Password: [your password]
# Remote dir: /var/www/mess.cvr.name/
# Local dir: F:\AISTUDIO\nova-dark-messenger\landing-3d\landing\
# Upload all files
```

Then on server:
```bash
nginx -t && systemctl reload nginx
```