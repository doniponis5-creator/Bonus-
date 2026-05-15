import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Remove <Stack.Screen options={{ ... }} />
    new_content = re.sub(r"<Stack\.Screen\s+options=\{[^}]+\}\s*/>\s*", "", content)
    # Remove empty or non-empty <Stack.Screen ... />
    new_content = re.sub(r"<Stack\.Screen.*?/>\s*", "", new_content, flags=re.DOTALL)
    
    if new_content != content:
        print(f"Stripped Stack.Screen from {filepath}")
        with open(filepath, 'w') as f:
            f.write(new_content)

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

