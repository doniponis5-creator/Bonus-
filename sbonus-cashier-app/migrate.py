import os
import re

# Названия экранов
SCREENS = {
    "login": "Login",
    "dashboard": "Dashboard",
    "search": "Search",
    "register": "Register",
    "history": "History",
    "earn": "Earn",
    "spend": "Spend",
    "customer/[id]": "Customer"
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if 'expo-router' not in content:
        return
        
    print(f"Migrating {filepath}...")
    
    # 1. Imports
    content = re.sub(
        r"import\s+\{(.*?)\}\s+from\s+'expo-router';",
        r"import { useNavigation, useRoute } from '@react-navigation/native';",
        content
    )
    
    # 2. useLocalSearchParams
    content = re.sub(
        r"const\s+\{([^}]+)\}\s*=\s*useLocalSearchParams\s*(<[^>]+>)?\(\);?",
        r"const route = useRoute<any>();\n  const {\1} = route.params || {};",
        content
    )
    
    # 3. Router logic
    # Add navigation hook if missing
    if 'navigation.' not in content and 'useNavigation' in content and 'const navigation =' not in content:
        content = re.sub(
            r"(export default function \w+\(\) \{)",
            r"\1\n  const navigation = useNavigation<any>();",
            content
        )
    
    # router.push('/(main)/search') -> navigation.navigate('Search')
    content = re.sub(r"router\.push\(['\"]/\(main\)/search['\"]\)", r"navigation.navigate('Search')", content)
    content = re.sub(r"router\.push\(['\"]/\(auth\)/login['\"]\)", r"navigation.navigate('Login')", content)
    content = re.sub(r"router\.replace\(['\"]/\(auth\)/login['\"]\)", r"navigation.replace('Login')", content)
    content = re.sub(r"router\.replace\(['\"]/\(main\)/dashboard['\"]\)", r"navigation.replace('Dashboard')", content)
    content = re.sub(r"router\.push\(['\"]/\(main\)/dashboard['\"]\)", r"navigation.navigate('Dashboard')", content)
    content = re.sub(r"router\.push\(['\"]/\(main\)/register['\"]\)", r"navigation.navigate('Register')", content)
    content = re.sub(r"router\.back\(\)", r"navigation.goBack()", content)
    
    # router.push({ pathname: '/(main)/customer/[id]', params: { id: client.id } })
    # -> navigation.navigate('Customer', { id: client.id })
    content = re.sub(
        r"router\.push\(\{\s*pathname:\s*['\"]/\(main\)/customer/\[id\]['\"],\s*params:\s*\{\s*id:\s*([^}]+)\}\s*\}\)",
        r"navigation.navigate('Customer', { id: \1 })",
        content
    )
    
    # router.push({ pathname: '/(main)/earn', params: { ... } })
    content = re.sub(
        r"router\.push\(\{\s*pathname:\s*['\"]/\(main\)/earn['\"],\s*params:\s*([^}]+?\}\s*)\}\)",
        r"navigation.navigate('Earn', \1)",
        content
    )
    
    # router.push({ pathname: '/(main)/spend', params: { ... } })
    content = re.sub(
        r"router\.push\(\{\s*pathname:\s*['\"]/\(main\)/spend['\"],\s*params:\s*([^}]+?\}\s*)\}\)",
        r"navigation.navigate('Spend', \1)",
        content
    )

    # router.push({ pathname: '/(main)/history', params: { ... } })
    content = re.sub(
        r"router\.push\(\{\s*pathname:\s*['\"]/\(main\)/history['\"],\s*params:\s*([^}]+?\}\s*)\}\)",
        r"navigation.navigate('History', \1)",
        content
    )
    
    # For any simple string paths that were missed:
    content = content.replace("router.push('/(main)/search')", "navigation.navigate('Search')")
    content = content.replace("router.replace('/(auth)/login')", "navigation.replace('Login')")
    
    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))

