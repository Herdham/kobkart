use crate::model::{RegisterRequest};
use argon2::{Argon2, password_hash::PasswordHasher};


pub fn validate_register(payload: &RegisterRequest) -> Result<(), String> {
    if payload.full_name.trim().is_empty() {
        Err("fullName cannot be empty".to_string())
    }else if payload.email.trim().is_empty() {
        Err("email cannot be empty".to_string())
    }else if payload.phone_number.trim().is_empty() {
        Err("phone number cannot be empty".to_string())
    }else if payload.password.trim().is_empty() {
        Err("password cannot be empty".to_string())
    }else {
        Ok(())
    }
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let argon2 = Argon2::default();

    let password_hash = argon2
        .hash_password(password.as_bytes())
        .map_err(|e| e.to_string())?
        .to_string();

    Ok(password_hash)
}