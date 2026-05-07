import yaml
import sys

def deduplicate_yaml(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f)
    
    tracked = data.get('tracked_companies', [])
    seen_names = set()
    unique_tracked = []
    
    for company in tracked:
        name = company.get('name')
        if name not in seen_names:
            unique_tracked.append(company)
            seen_names.add(name)
        else:
            print(f"Removing duplicate: {name}")
            
    data['tracked_companies'] = unique_tracked
    
    with open(file_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, sort_keys=False, allow_unicode=True)

if __name__ == "__main__":
    deduplicate_yaml(sys.argv[1])
