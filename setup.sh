cat > /tmp/setup_fixed.sh << 'SHEOF'
#!/bin/bash
# TC Radio v3.1 - Fixed Setup for Raspberry Pi OS (Python 3.13)
# Works with latest Raspberry Pi OS

set -e

echo "=========================================="
echo "  TC Radio v3.1 - Fresh Install (Fixed)"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[*]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }

# Check not root
if [ "$EUID" -eq 0 ]; then
   print_error "Don't run as root. Run as normal user (pi)."
   exit 1
fi

# 1. System Update
print_status "Updating system..."
sudo apt update && sudo apt upgrade -y
print_success "System updated"

# 2. Install system dependencies
print_status "Installing system packages..."
sudo apt install -y \
    python3-pip \
    python3-full \
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
    alsa-utils \
    python3-pygame \
    python3-pil \
    python3-qrcode \
    python3-flask \
    python3-requests

print_success "System packages installed"

# 3. Create virtual environment (avoids system conflicts)
print_status "Creating Python virtual environment..."
RADIO_DIR="$HOME/tcradio"
mkdir -p "$RADIO_DIR"
cd "$RADIO_DIR"

python3 -m venv venv --system-site-packages
source venv/bin/activate

# 4. Install packages in venv (without version pins)
print_status "Installing Python packages in virtual environment..."

pip install --upgrade pip wheel setuptools

# Install packages one by one to handle errors better
pip install python-vlc || print_warning "python-vlc install failed, will use system package"
pip install yt-dlp || print_warning "yt-dlp install failed"

deactivate

print_success "Python environment ready"

# 5. Download radio file
print_status "Downloading TC Radio..."
GITHUB_URL="https://raw.githubusercontent.com/simsonpeter/Tcradios/main/touch_radio_youtube.py"

if curl -fsSL -o touch_radio_youtube.py "$GITHUB_URL"; then
    print_success "Radio file downloaded"
else
    print_error "Failed to download from GitHub"
    exit 1
fi

chmod +x touch_radio_youtube.py

# 6. Create launcher script that uses venv
print_status "Creating launcher..."
cat > "$RADIO_DIR/start.sh" << 'EOF'
#!/bin/bash
cd ~/tcradio
source venv/bin/activate
python3 touch_radio_youtube.py
EOF
chmod +x "$RADIO_DIR/start.sh"

# 7. Create systemd service
print_status "Creating auto-start service..."
sudo tee /etc/systemd/system/tcradio.service > /dev/null << EOF
[Unit]
Description=TC Radio v3.1
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=$RADIO_DIR
Environment=HOME=/home/pi
Environment=USER=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
Environment=SDL_VIDEODRIVER=x11
ExecStart=$RADIO_DIR/venv/bin/python $RADIO_DIR/touch_radio_youtube.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tcradio
print_success "Auto-start service created"

# Get IP
IP_ADDRESS=$(hostname -I | awk '{print $1}' || echo "unknown")

echo ""
echo "=========================================="
echo "  ✅ SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "📻 TC Radio installed at: $RADIO_DIR"
echo "🌐 Web Remote: http://$IP_ADDRESS:8080"
echo ""
echo "Commands:"
echo "  Start now:     cd ~/tcradio && ./start.sh"
echo "  Auto-start:    sudo systemctl start tcradio"
echo "  Stop:          sudo systemctl stop tcradio"
echo "  View logs:     sudo journalctl -u tcradio -f"
echo ""
echo "=========================================="

read -p "Start TC Radio now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Starting TC Radio..."
    cd "$RADIO_DIR"
    ./start.sh &
    sleep 3
    print_success "Started! Open http://$IP_ADDRESS:8080"
fi

SHEOF
chmod +x /tmp/setup_fixed.sh
