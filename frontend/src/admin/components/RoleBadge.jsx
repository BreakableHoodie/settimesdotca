// Role badge component for displaying user roles with color coding
// Props: role (string: 'admin', 'editor', 'viewer')

export default function RoleBadge({ role }) {
  const getRoleStyles = () => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800'
      case 'editor':
        return 'bg-blue-100 text-blue-800'
      case 'viewer':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleStyles()}`}>{role}</span>
}
