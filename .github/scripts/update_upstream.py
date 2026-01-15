#!/usr/bin/env python3
"""
Script to automatically update Nimbus upstream version and package version.
Checks status-im/nimbus-eth2 for the latest release and updates configuration files accordingly.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path


def get_latest_nimbus_release():
    """Fetch the latest release tag from status-im/nimbus-eth2 repository."""
    url = "https://api.github.com/repos/status-im/nimbus-eth2/releases/latest"
    
    # Create request with proper headers
    request = urllib.request.Request(url)
    request.add_header('User-Agent', 'AVADO-DNP-Nimbus-Update-Bot')
    request.add_header('Accept', 'application/vnd.github.v3+json')
    
    # Add GitHub token if available (for authenticated requests)
    github_token = os.getenv('GITHUB_TOKEN')
    if github_token:
        request.add_header('Authorization', f'token {github_token}')
    
    try:
        with urllib.request.urlopen(request) as response:
            data = json.loads(response.read().decode())
            tag_name = data.get("tag_name", "")
            # Nimbus uses 'v' prefix in upstream version (e.g., v25.12.0)
            return tag_name
    except urllib.error.HTTPError as e:
        print(f"HTTP Error fetching latest release: {e.code} {e.reason}", file=sys.stderr)
        if e.code == 403:
            print("Rate limit exceeded or authentication required.", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Network error fetching latest release: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error fetching latest release: {e}", file=sys.stderr)
        sys.exit(1)


def increment_patch_version(version):
    """Increment the patch version number (e.g., 0.0.38 -> 0.0.39)."""
    parts = version.split('.')
    if len(parts) != 3:
        print(f"Invalid version format: {version}", file=sys.stderr)
        sys.exit(1)
    
    parts[2] = str(int(parts[2]) + 1)
    return '.'.join(parts)


def update_dappnode_package(file_path, new_version, new_upstream):
    """Update version and upstream in dappnode_package.json."""
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    old_version = data.get('version', '')
    old_upstream = data.get('upstream', '')
    
    data['version'] = new_version
    data['upstream'] = new_upstream
    
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')  # Add trailing newline
    
    return old_version, old_upstream


def update_docker_compose(file_path, new_version, new_upstream):
    """Update image tag and NIMBUS_VERSION in docker-compose.yml."""
    with open(file_path, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    updated_lines = []
    
    for line in lines:
        # Update image tag
        if 'image:' in line and 'nimbus.avado.dnp.dappnode.eth:' in line:
            # Preserve indentation
            indent = line[:line.index('image:')]
            updated_lines.append(f"{indent}image: 'nimbus.avado.dnp.dappnode.eth:{new_version}'")
        # Update NIMBUS_VERSION
        elif 'NIMBUS_VERSION:' in line:
            indent = line[:line.index('NIMBUS_VERSION:')]
            updated_lines.append(f"{indent}NIMBUS_VERSION: {new_upstream}")
        else:
            updated_lines.append(line)
    
    with open(file_path, 'w') as f:
        f.write('\n'.join(updated_lines))
        # Preserve trailing newline if original file had one
        if content.endswith('\n'):
            f.write('\n')


def set_github_outputs(variables):
    """Set GitHub Actions outputs and environment variables.
    
    Args:
        variables: Dictionary of variable names and values to set
    """
    # Set GitHub Actions output
    if os.getenv('GITHUB_OUTPUT'):
        with open(os.getenv('GITHUB_OUTPUT'), 'a') as f:
            for key, value in variables.items():
                f.write(f"{key}={value}\n")
    
    # Also set as environment variables for the workflow
    if os.getenv('GITHUB_ENV'):
        with open(os.getenv('GITHUB_ENV'), 'a') as f:
            for key, value in variables.items():
                f.write(f"{key}={value}\n")


def main():
    # Get the repository root directory
    repo_root = Path(__file__).parent.parent.parent
    
    # File paths
    dappnode_package_path = repo_root / "dappnode_package.json"
    docker_compose_path = repo_root / "build" / "docker-compose.yml"
    
    print("Checking for Nimbus updates...")
    
    # Get latest Nimbus release
    latest_nimbus_version = get_latest_nimbus_release()
    print(f"Latest Nimbus version: {latest_nimbus_version}")
    
    # Read current upstream version
    with open(dappnode_package_path, 'r') as f:
        current_data = json.load(f)
    
    current_upstream = current_data.get('upstream', '')
    current_version = current_data.get('version', '')
    
    print(f"Current upstream version: {current_upstream}")
    print(f"Current package version: {current_version}")
    
    # Compare versions
    if latest_nimbus_version == current_upstream:
        print("Already up to date!")
        set_github_outputs({'updated': 'false'})
        sys.exit(0)
    
    print(f"New version available: {latest_nimbus_version}")
    
    # Increment package version
    new_package_version = increment_patch_version(current_version)
    print(f"New package version: {new_package_version}")
    
    # Update files
    print("Updating dappnode_package.json...")
    update_dappnode_package(dappnode_package_path, new_package_version, latest_nimbus_version)
    
    print("Updating build/docker-compose.yml...")
    update_docker_compose(docker_compose_path, new_package_version, latest_nimbus_version)
    
    print("Update complete!")
    
    # Set GitHub Actions output
    set_github_outputs({
        'updated': 'true',
        'old_version': current_upstream,
        'new_version': latest_nimbus_version,
        'package_version': new_package_version
    })


if __name__ == "__main__":
    main()
