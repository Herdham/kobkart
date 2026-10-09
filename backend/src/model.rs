use serde::{Serialize, Deserialize};

#[derive(Deserialize)]
pub struct RegisterRequest{
    pub full_name: String,
    pub email: String,
    pub phone_number: String,
    pub password: String
}

#[derive(Serialize)]
pub struct UserRequest{
    pub full_name: String,
    pub email: String,
    pub phone_number: String
}