import os, glob

def process_dir(path):
    for root, dirs, files in os.walk(path):
        for file in files:
            if file.endswith('.dart'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                
                new_content = content.replace('.withOpacity(', '.withValues(alpha: ')
                new_content = new_content.replace('MaterialStateProperty', 'WidgetStateProperty')
                new_content = new_content.replace('MaterialState', 'WidgetState')
                
                if new_content != content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Fixed {filepath}")

process_dir('/home/zmey1/VSCODE_FILES/ShiftSure/mobile/lib')
process_dir('/home/zmey1/VSCODE_FILES/ShiftSure/admin/lib')
