export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return "Enter a valid email address";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < 8) return "At least 8 characters required";
  if (!/[A-Z]/.test(password)) return "Must contain an uppercase letter";
  if (!/[0-9]/.test(password)) return "Must contain a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Must contain a special character";
  return null;
}

export function validateFullName(name: string): string | null {
  if (!name.trim()) return "Full name is required";
  if (name.trim().length < 2) return "At least 2 characters required";
  if (name.trim().length > 100) return "Full name too long";
  return null;
}

export function validateConfirmPassword(
  password: string,
  confirm: string,
): string | null {
  if (!confirm) return "Please confirm your password";
  if (password !== confirm) return "Passwords do not match";
  return null;
}

export function validateTaskTitle(title: string): string | null {
  if (!title.trim()) return "Task title is required";
  if (title.trim().length > 200) return "Title cannot exceed 200 characters";
  return null;
}

export function validateTaskDescription(desc: string): string | null {
  if (desc.length > 2000) return "Description cannot exceed 2000 characters";
  return null;
}
