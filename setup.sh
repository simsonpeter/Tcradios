#!/bin/bash
# TC Radio v3.1 - Fresh OS Setup Script
# Run this after installing fresh Raspberry Pi OS

set -e  # Exit on any error

echo "=========================================="
echo "  TC Radio v3.1 - Fresh Install"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as root (we don't want that)
if [ "$EUID" -eq 0 ]; then
   print_error "Don't run as root/sudo. Run as normal user (pi)."
   exit 1
fi

# 1. System Update
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y
print_success "System updated"

# 2. Install system dependencies
print_status "Installing system packages (this may take a while)..."
sudo apt install -y \
    python3-pip \
    python3-venv \
    vlc \
    libvlc-dev \
    libvlccore-dev \
    espeak \
    espeak-data \
    ffmpeg \
    git \
    libsdl2-dev \
    libsdl2-image-dev \
    libsdl2-mixer-dev \
    libsdl2-ttf-dev \
    libportmidi-dev \
    libswscale-dev \
    libavformat-dev \
    libavcodec-dev \
    zlib1g-dev \
    libfreetype6-dev \
    libjpeg-dev \
    libpng-dev \
    portaudio19-dev \
    pulseaudio \
    alsa-utils

print_success "System packages installed"

# 3. Create radio directory
print_status "Creating TC Radio directory..."
RADIO_DIR="$HOME/tcradio"
mkdir -p "$RADIO_DIR"
cd "$RADIO_DIR"
print_success "Directory created: $RADIO_DIR"

# 4. Install Python packages
print_status "Installing Python modules..."
sudo pip3 install --break-system-packages \
    flask==3.0.0 \
    pygame==2.5.2 \
    python-vlc==3.0.20123 \
    qrcode==7.4.2 \
    pillow==10.1.0 \
    yt-dlp==2023.12.30 \
    requests==2.31.0

print_success "Python modules installed"

# 5. Download radio file
print_status "Downloading TC Radio from GitHub..."
GITHUB_URL="https://raw.githubusercontent.com/simsonpeter/Tcradios/main/touch_radio_youtube.py"

if curl -fsSL -o touch_radio_youtube.py "$GITHUB_URL"; then
    print_success "Radio file downloaded"
else
    print_error "Failed to download from GitHub"
    print_status "Trying alternative method..."
    wget -q -O touch_radio_youtube.py "$GITHUB_URL" || {
        print_error "All download methods failed"
        exit 1
    }
fi

# Make executable
chmod +x touch_radio_youtube.py

# 6. Create config directory
mkdir -p "$HOME/.config/tcradio"

# 7. Create systemd service for auto-start
print_status "Creating auto-start service..."

sudo tee /etc/systemd/system/tcradio.service > /dev/null << EOF
[Unit]
Description=TC Radio v3.1
After=network.target sound.target pulseaudio.service
Wants=pulseaudio.service

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=$RADIO_DIR
Environment=HOME=/home/pi
Environment=USER=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
Environment=SDL_VIDEODRIVER=x11
Environment=PULSE_RUNTIME_PATH=/run/user/1000/pulse
ExecStartPre=/bin/sleep 5
ExecStart=/usr/bin/python3 $RADIO_DIR/touch_radio_youtube.py
Restart=always
RestartSec=10
KillMode=process
TimeoutSec=30

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tcradio
print_success "Auto-start service created"

# 8. Create desktop shortcut (if using desktop OS)
if [ -d "$HOME/Desktop" ]; then
    print_status "Creating desktop shortcut..."
    cat > "$HOME/Desktop/TC-Radio.desktop" << EOF
[Desktop Entry]
Name=TC Radio
Comment=Internet Radio with YouTube
Exec=python3 $RADIO_DIR/touch_radio_youtube.py
Icon=multimedia-audio-player
Terminal=true
Type=Application
Categories=AudioVideo;Audio;
EOF
    chmod +x "$HOME/Desktop/TC-Radio.desktop"
    print_success "Desktop shortcut created"
fi

# 9. Create launcher script
print_status "Creating launcher script..."
cat > "$RADIO_DIR/start.sh" << 'EOF'
#!/bin/bash
cd ~/tcradio
python3 touch_radio_youtube.py
EOF
chmod +x "$RADIO_DIR/start.sh"

# 10. Get IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}' || echo "unknown")

echo ""
echo "=========================================="
echo "  ✅ SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "📻 TC Radio v3.1 is installed at: $RADIO_DIR"
echo ""
echo "🌐 Web Remote: http://$IP_ADDRESS:8080"
echo ""
echo "📱 Open this URL on your phone (same WiFi)"
echo ""
echo "Commands:"
echo "  Start now:     cd ~/tcradio && ./start.sh"
echo "  Auto-start:    sudo systemctl start tcradio"
echo "  Stop:          sudo systemctl stop tcradio"
echo "  View logs:     sudo journalctl -u tcradio -f"
echo "  Disable auto:  sudo systemctl disable tcradio"
echo ""
echo "Files:"
echo "  Radio code:    ~/tcradio/touch_radio_youtube.py"
echo "  Settings:      ~/.config/tcradio/"
echo ""
echo "=========================================="
echo ""

# Ask to start now
read -p "Start TC Radio now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting TC Radio..."
    cd "$RADIO_DIR"
    python3 touch_radio_youtube.py &
    sleep 3
    print_success "TC Radio started!"
    print_status "Open http://$IP_ADDRESS:8080 on your phone"
else
    print_status "You can start later with: cd ~/tcradio && ./start.sh"
fi
